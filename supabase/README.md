# Supabase 보안 설정

브라우저는 공개용 키로 Supabase에 접속하기 때문에, 한 계정의 기록을 다른 계정이 읽거나 고치지 못하게 막는 것은 `coffee_data` 테이블의 행 단위 보안(RLS) 정책뿐입니다. 이 폴더는 그 정책을 저장소에 기록하고 검증하기 위한 것입니다.

| 파일 | 하는 일 |
| --- | --- |
| `migrations/20261026000000_coffee_data_rls.sql` | `coffee_data` 테이블과 정책의 기준. 여러 번 실행해도 안전하고, 이미 있는 테이블은 그대로 두며 정책만 아래 네 개로 맞춥니다. |
| `migrations/20261026000100_coffee_data_version.sql` | 두 기기가 동시에 저장해도 서로 덮어쓰지 않도록 행마다 `version`을 두고, 저장할 때마다 DB가 1씩 올립니다. |
| `checks/inspect_coffee_data_security.sql` | 지금 실제로 걸려 있는 보호 상태를 보여 주는 읽기 전용 조회. 운영 DB에서 실행해도 아무것도 바꾸지 않습니다. |
| `tests/coffee_data_rls_test.sql` | 계정 간 읽기·쓰기 차단 테스트. 테스트용 DB에서만 실행하고, 끝나면 모두 되돌립니다. |
| `tests/coffee_data_version_test.sql` | 옛 버전을 기준으로 한 저장이 아무것도 바꾸지 못하는지, 예전 방식(upsert) 저장도 버전을 올리는지 확인합니다. |
| `tests/plain_postgres_stub.sql` | Supabase 없이 일반 PostgreSQL에서 테스트할 때만 쓰는 최소한의 `auth` 흉내. |

## 정책 내용

- 로그인한 사용자는 `user_id`가 자기 계정인 행만 읽기·추가·수정·삭제할 수 있습니다.
- 수정할 때 `user_id`를 다른 계정으로 바꿔 넘기는 것도 막습니다.
- 로그인하지 않은 방문자(`anon`)는 테이블에 전혀 접근하지 못합니다.
- 정책은 서로 OR로 합쳐지므로, 대시보드에서 예전에 만든 넓은 정책이 하나라도 남아 있으면 나머지가 무력해집니다. 그래서 마이그레이션은 기존 정책을 모두 지우고 네 개를 다시 만듭니다.
- 앱의 저장(`upsert`, `onConflict: "user_id,key"`)에 필요한 `(user_id, key)` 고유 인덱스가 없으면 추가합니다.

## 2026-10-26 운영 DB 확인 결과

RLS가 켜져 있고, 네 정책 모두 `auth.uid() = user_id` 조건이라 다른 계정의 행은 읽기·쓰기가 막혀 있습니다. 다만 정책 대상이 `{public}`이고 `anon`에 표 권한이 남아 있습니다(로그인하지 않으면 `auth.uid()`가 비어 실제로는 아무 행도 못 봄). 정책 마이그레이션을 실행하면 이 두 가지도 조여집니다.

## 동시 저장과 version

앱은 저장하기 전에 서버 사본을 읽어 필드 단위로 병합한 뒤, "내가 읽은 version일 때만" 저장합니다. 그 사이 다른 기기가 먼저 저장했다면 아무것도 바뀌지 않고, 앱이 새 사본을 다시 읽어 병합한 뒤 다시 저장합니다. `version` 열이 아직 없으면 예전 방식(upsert 후 1.5초 뒤 재확인)으로 저장하는데, 이 방식은 두 기기에서 같은 원두를 거의 동시에 사용 처리하면 한쪽 사용량이 빠질 수 있습니다(`tests/sync`의 TODO 테스트). 앱 코드는 열이 있든 없든 동작하므로, 마이그레이션은 배포 전후 아무 때나 실행해도 됩니다.

## 운영 DB 확인과 적용

1. Supabase 대시보드 → SQL Editor에서 `checks/inspect_coffee_data_security.sql`을 실행해 지금 상태를 확인합니다. 정상이라면 `rls_enabled=t`, 정책 네 개(`*_own`, 대상 `{authenticated}`), `anon` 권한 없음이 보입니다.
2. 다르게 나오면 결과를 확인한 뒤 `migrations/20261026000000_coffee_data_rls.sql`을 실행합니다. 운영 DB를 바꾸는 단계이므로 직접 확인하고 실행해 주세요.
3. 다시 1번을 실행해 기대한 상태인지 봅니다.

## 테스트 실행

로컬 Supabase(`supabase start`, Docker 필요)나 테스트용 프로젝트에서:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261026000000_coffee_data_rls.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261026000100_coffee_data_version.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/coffee_data_rls_test.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/coffee_data_version_test.sql
```

Supabase 없이 일반 PostgreSQL에서는 먼저 `tests/plain_postgres_stub.sql`을 실행한 뒤 위 명령을 실행합니다. 성공하면 `... all checks passed`가 나오고, 하나라도 막히지 않으면 `FAILED: ...`로 멈춥니다.

확인하는 것: 계정 A가 B의 행을 읽기, B 계정으로 행 만들기, upsert로 B의 행 덮어쓰기, B의 행 수정·삭제, 자기 행을 B에게 넘기기를 모두 못 하는지, 자기 행은 정상적으로 고칠 수 있는지, 로그인하지 않은 방문자가 읽기·쓰기를 못 하는지, 그리고 시도가 끝난 뒤 B의 기록이 그대로인지.

앱 쪽 동기화 충돌 테스트(두 기기가 가짜 Supabase에 동시에 저장)는 `npm test`로 실행합니다.
