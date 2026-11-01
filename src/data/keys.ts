export const STORAGE_KEYS = { beans: "cf_beans", brews: "cf_brews", notes: "cf_notes", recipes: "cf_recipes", drippers: "cf_drippers", grinders: "cf_grinders", filters: "cf_filters", waters: "cf_waters" };

// Pick-lists the bean form keeps per account: origins added by hand, and roasteries/varieties hidden from its suggestions.
export const LIST_KEYS = { origins: "cf_origins", hiddenRoasteries: "cf_hidden_roasteries", hiddenVarieties: "cf_hidden_varieties" };

// Peak window settings per account: defaults per roast level, espresso extra days and per-roastery windows (PeakSettings).
export const PEAK_KEY = "cf_peak";
