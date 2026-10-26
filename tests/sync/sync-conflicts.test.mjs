// Two devices editing the same account's beans at the same time, against a fake Supabase table.
// Run: npm test   (node --test tests/)
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { Worker } from "node:worker_threads";
import { startFakeSupabase } from "./fake-supabase.mjs";
import { buildSync } from "./load.mjs";

const KEY = "cf_beans";
const USER = "00000000-0000-4000-a000-00000000000a";
const BASE = [
  { id: 1, name: "Ethiopia Guji", roastery: "Fritz", remaining: 200, memo: "" },
  { id: 2, name: "Kenya AA", roastery: "Momos", remaining: 100, memo: "" },
];
const byId = list => Object.fromEntries(list.map(item => [item.id, item]));
const edit = (list, id, changes) => list.map(item => item.id === id ? { ...item, ...changes } : item);

function startDevice(origin, syncModule) {
  const worker = new Worker(new URL("./device.mjs", import.meta.url), { workerData: { origin, syncModule } });
  const waiting = new Map();
  let next = 0;
  const ready = new Promise((resolve, reject) => {
    worker.on("error", reject);
    worker.on("message", message => {
      if (message.ready) return resolve();
      const { resolve: done, reject: fail } = waiting.get(message.id);
      waiting.delete(message.id);
      message.error ? fail(new Error(message.error)) : done(message.result);
    });
  });
  const call = (command, args = {}) => new Promise((resolve, reject) => {
    const id = next++;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, command, args: { key: KEY, userId: USER, ...args } });
  });
  return {
    ready,
    start: value => call("start", { value }),
    edit: value => call("edit", { value }),
    refresh: () => call("refresh"),
    local: () => call("local"),
    pending: () => call("pending"),
    stop: () => worker.terminate(),
  };
}

for (const versionColumn of [true, false]) describe(`two devices saving at the same time (${versionColumn ? "versioned saves" : "database without the version column"})`, { concurrency: false }, () => {
  let server, phone, laptop, syncModule;
  before(async () => { server = await startFakeSupabase(); syncModule = await buildSync(); });
  after(async () => { await server.close(); });
  beforeEach(async () => {
    await phone?.stop(); await laptop?.stop();
    server.state.versionColumn = versionColumn;
    server.set(USER, KEY, BASE);
    server.state.readDelay = 0; server.state.writeDelay = 0;
    phone = startDevice(server.origin, syncModule); laptop = startDevice(server.origin, syncModule);
    await Promise.all([phone.ready, laptop.ready]);
    await Promise.all([phone.start(BASE), laptop.start(BASE)]);
  });
  after(async () => { await phone?.stop(); await laptop?.stop(); });

  // Both devices read the server before either saves, so the second save first overwrites the first.
  const race = async (phoneValue, laptopValue) => {
    server.state.readDelay = 300;
    await Promise.all([phone.edit(phoneValue), laptop.edit(laptopValue)]);
    server.state.readDelay = 0;
    await phone.refresh(); await laptop.refresh();
  };
  const expectEverywhere = async check => {
    const values = { server: server.get(USER, KEY), phone: await phone.local(), laptop: await laptop.local() };
    for (const [where, value] of Object.entries(values)) check(value, where);
    assert.deepEqual(values.phone, values.server, "phone matches the server");
    assert.deepEqual(values.laptop, values.server, "laptop matches the server");
    assert.equal(await phone.pending(), false, "phone has nothing left to send");
    assert.equal(await laptop.pending(), false, "laptop has nothing left to send");
  };

  test("different fields of the same bean: both changes are kept", async () => {
    await race(edit(BASE, 1, { name: "Ethiopia Guji Natural" }), edit(BASE, 1, { roastery: "Fritz Coffee" }));
    await expectEverywhere((beans, where) => {
      assert.equal(byId(beans)[1].name, "Ethiopia Guji Natural", `${where}: phone's name edit`);
      assert.equal(byId(beans)[1].roastery, "Fritz Coffee", `${where}: laptop's roastery edit`);
    });
  });

  // Without versions a save can't tell whether the server copy already includes its own deduction, so one may be lost.
  test("stock used on both devices: both deductions count", { todo: versionColumn ? false : "needs the version column" }, async () => {
    await race(edit(BASE, 1, { remaining: 185 }), edit(BASE, 1, { remaining: 180 }));
    await expectEverywhere((beans, where) => assert.equal(byId(beans)[1].remaining, 165, `${where}: 200 - 15 - 20`));
  });

  test("different beans: an added bean and an edited bean are both kept", async () => {
    const added = { id: 3, name: "Colombia Huila", roastery: "Fritz", remaining: 250, memo: "" };
    await race([...BASE, added], edit(BASE, 2, { memo: "berry" }));
    await expectEverywhere((beans, where) => {
      assert.deepEqual(byId(beans)[3], added, `${where}: phone's new bean`);
      assert.equal(byId(beans)[2].memo, "berry", `${where}: laptop's memo`);
    });
  });

  test("a deletion on one device and an edit of another bean on the other are both kept", async () => {
    await race(BASE.filter(bean => bean.id !== 2), edit(BASE, 1, { memo: "floral" }));
    await expectEverywhere((beans, where) => {
      assert.equal(byId(beans)[2], undefined, `${where}: bean 2 deleted`);
      assert.equal(byId(beans)[1].memo, "floral", `${where}: laptop's memo`);
    });
  });

  test("a device that missed an earlier save still keeps it when it saves later", async () => {
    await phone.edit(edit(BASE, 1, { name: "Ethiopia Guji Natural" }));
    await laptop.edit(edit(BASE, 1, { memo: "jasmine" }));
    await phone.refresh();
    await expectEverywhere((beans, where) => {
      assert.equal(byId(beans)[1].name, "Ethiopia Guji Natural", `${where}: phone's earlier edit`);
      assert.equal(byId(beans)[1].memo, "jasmine", `${where}: laptop's later edit`);
    });
  });

  // Versioned saves show the merged copy only once it is saved, so an edit can start from the copy before the merge.
  // (Without versions the merged copy is shown before saving, so a later edit already includes it.)
  test("an edit made while the previous save is still on its way is sent too, without losing the other device's change", { skip: !versionColumn }, async () => {
    await laptop.edit(edit(BASE, 1, { name: "Ethiopia Guji Natural" }));
    server.state.writeDelay = 300;
    const first = phone.edit(edit(BASE, 1, { remaining: 185 }));
    await new Promise(resolve => setTimeout(resolve, 150));
    await phone.edit(edit(BASE, 1, { remaining: 170 }));
    await first;
    server.state.writeDelay = 0;
    await phone.refresh(); await laptop.refresh();
    await expectEverywhere((beans, where) => {
      assert.equal(byId(beans)[1].name, "Ethiopia Guji Natural", `${where}: laptop's earlier edit`);
      assert.equal(byId(beans)[1].remaining, 170, `${where}: phone's latest stock`);
    });
  });

  test("the same field changed on both devices: both end up showing one of the two values", async () => {
    await race(edit(BASE, 1, { memo: "from phone" }), edit(BASE, 1, { memo: "from laptop" }));
    await expectEverywhere((beans, where) => assert.ok(["from phone", "from laptop"].includes(byId(beans)[1].memo), `${where}: one of the edits`));
  });
});

describe("mergeSynced (the merge used before every save)", async () => {
  const { mergeSynced } = await import(await buildSync());

  test("takes each field from the side that changed it", () => {
    const merged = mergeSynced(BASE, edit(BASE, 1, { name: "mine" }), edit(BASE, 1, { roastery: "theirs" }));
    assert.deepEqual(byId(merged)[1], { ...BASE[0], name: "mine", roastery: "theirs" });
  });

  test("adds up stock deductions from both sides", () => {
    const merged = mergeSynced(BASE, edit(BASE, 1, { remaining: 185.5 }), edit(BASE, 1, { remaining: 180 }));
    assert.equal(byId(merged)[1].remaining, 165.5);
  });

  test("keeps a field one side added and drops a field one side removed", () => {
    const { memo, ...withoutMemo } = BASE[1];
    const merged = mergeSynced(BASE, edit(BASE, 1, { rating: 4 }), [BASE[0], withoutMemo]);
    assert.equal(byId(merged)[1].rating, 4);
    assert.equal("memo" in byId(merged)[2], false);
  });

  test("an item deleted on one side stays deleted even if the other side edited it", () => {
    const merged = mergeSynced(BASE, BASE.filter(bean => bean.id !== 2), edit(BASE, 2, { memo: "edited" }));
    assert.equal(byId(merged)[2], undefined);
  });

  test("items added on both sides are all kept", () => {
    const mine = [...BASE, { id: 3, name: "mine" }], theirs = [...BASE, { id: 4, name: "theirs" }];
    assert.deepEqual(mergeSynced(BASE, mine, theirs).map(bean => bean.id).sort(), [1, 2, 3, 4]);
  });

  test("lists of plain strings (e.g. saved dripper names) merge as sets", () => {
    assert.deepEqual(mergeSynced(["V60"], ["V60", "Kalita"], ["Origami"]).sort(), ["Kalita", "Origami"]);
  });

  test("values that are not lists of records are not merged: this device's value wins", () => {
    assert.deepEqual(mergeSynced({ a: 1 }, { a: 2 }, { a: 3 }), { a: 2 });
    assert.deepEqual(mergeSynced([{ id: 1 }], [{ id: 1 }, { noId: true }], [{ id: 1, x: 1 }]), [{ id: 1 }, { noId: true }]);
  });
});
