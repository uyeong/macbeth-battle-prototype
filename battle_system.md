# 그리드 기반 1점 투시 턴제 시스템 — 명세

이 문서는 어떤 엔진/언어로든 동등한 씬을 구현할 수 있도록 작성된 시스템 명세서다. 무대 위에 갈라 선 양 진영이 점점 가까워지며 사거리에서 격돌하는 *횡축 진형 전투* 의 양식을 구현하기 위한 좌표계·상태 머신·통신 규약을 담는다.

문서 구조는 4-블록 + 부록:

- **시스템 명세** (§1~§9) — 시스템이 자체적으로 책임지는 것
- **콘텐츠 인터페이스** (§10~§15) — 콘텐츠가 채워야 할 슬롯과 스키마
- **시스템↔콘텐츠 통신** (§16~§22) — 데이터/콜백/API/Intent 네 축
- **확장과 검증** (§23~§26)
- **부록** (§A~§C) — 엔진 매핑, 참고 콘텐츠, 우회 기법

핵심 분리 원칙: 시스템은 *시간과 공간의 룰*을 가지고, 콘텐츠는 *누가 무엇을 어떻게*를 정의한다. 본문 §1~§9 는 *어떤 콘텐츠가 와도 변하지 않는 것*, §10~§15 는 *콘텐츠가 채울 슬롯의 형상*, §16~§22 는 *둘 사이의 통신 규약*.

---

# §0 영감의 원천 — 맥베스 시스템

본 시스템의 양식은 *맥베스 시스템*이라 불린 전투 메커닉을 출발점으로 한다. 그 정의는 다음과 같다:

> 제한된 종축 이동과 원근감에 초점을 맞춘 전투 방식. 주인공들이 연극 무대 위에서 편 갈라 싸우는 연기를 하고 있는 모습을 상상하면 된다.

핵심 요소 셋:

1. **제한된 종축 이동** — row 가 적고(예: 4), 깊이 방향 행동이 좁은 무대. 양 진영은 *좌우* 로 길게 갈라져 있고, *앞뒤* 이동은 보조적.
2. **원근감** — 1점 투시로 무대 깊이를 시각화. 카메라가 좌우로 패닝해도 소실점은 화면 중앙에 고정 (§1, §2).
3. **연극 무대 비유** — 양 진영이 좌·우 끝에서 마주 보고, 가운데로 전진해 사거리에서 격돌. *행진감* 이 의도된 연출.

본 명세 §1 의 3 정체성과 §23 의 디자인 의도는 이 *맥베스적 양식* 을 엔진 비종속 규약으로 풀어낸 것. 콘텐츠(캐릭터/스킬/배경)가 무엇으로 교체되든 이 양식이 보존되도록 시스템이 강제한다.

특정 작품에의 의존은 없음 — 양식만이 시스템 정체성. 본 명세는 그 양식을 *어떤 엔진/언어로든 재현 가능한 형태로* 형식화한 것이다.

---

# 1부 · 시스템 명세

## §1 시스템 정체성

좌우로 긴 무대 위에 양 진영이 양 끝에서 시작해, 매 턴 조금씩 이동하다 사거리에 들면 격돌 — *맥베스 시스템*(§0)을 코드 규약으로 형식화한 것. 시스템 정체성 세 가지 — 구현 시 반드시 보존:

1. **타일 그리드** — `COLS × ROWS`. 좌우 + 상하 모두 이동 가능. 거리는 **맨해튼**.
2. **진짜 1점 투시** — 모든 세로(깊이) 격자선이 화면 중앙 소실점으로 수렴. 카메라가 좌우 스크롤해도 소실점은 화면 중앙에 고정.
3. **2단 확정 UX** — 액션 선택 → 적용 범위 시각화 → 한 번 더 확정 클릭으로 발동.

"단순 패럴랙스 스크롤로 깊이감을 흉내내는" 우회는 *의도된 디자인 위반*. 격자와 엔티티 좌표는 *매 프레임 투영 함수로 직접 계산*.

---

## §2 좌표계

### §2.1 그리드(논리) 좌표

- `COLS`, `ROWS` 정수. row 0 = 가장 앞(뷰어 쪽), row `ROWS-1` = 가장 뒤(소실점 쪽).
- 셀 중심은 `(col + 0.5, row + 0.5)`.
- 거리: **맨해튼** `|dc| + |dr|`.
- 점유 단위는 셀 — 두 엔티티가 같은 셀에 못 들어감.

### §2.2 월드 좌표

- 월드 폭 `WORLD_W = COLS * COL_W`. 깊이 축은 *월드 좌표가 아니라* row 값을 그대로 투영 함수에 전달.
- 카메라는 가로(scrollX)만 스크롤. 세로 스크롤 없음.

### §2.3 투영 수식

```
factor(rp) = D / (D + rp * ROW_DEPTH)             // 깊이 클수록 0으로 수렴
screen_x   = VIEW_W/2 + (worldX - camCenterWorldX) * factor
screen_y   = HORIZON_Y - GROUND_Y * factor
```

- `rp` (rowProgress): 깊이 위치. 정수 row 라인은 `rp = 0..ROWS`, 셀 중심은 `rp = row + 0.5`.
- `worldX`: 월드 좌표 X. 셀 중심이면 `(col + 0.5) * COL_W`.
- `camCenterWorldX = cameraScrollX + VIEW_W/2`.

튜닝 파라미터의 의미:
- `D` — 초점거리. **작을수록 원근 강함**.
- `ROW_DEPTH` — 한 row 당 가상 z 증가량. 클수록 row 간 압축 큼.
- `HORIZON_Y` — 화면 좌표의 소실점 Y.
- `GROUND_Y` — 음수. 카메라가 지면 위 `|GROUND_Y|` 만큼 떠 있다는 의미.

결과:
- row 0 (앞): factor = 1.0, 압축 없음.
- row `ROWS` (뒤): factor < 1, 화면 중앙 + horizon Y 쪽으로 수렴.
- 카메라가 좌우로 스크롤해도 소실점은 `(VIEW_W/2, HORIZON_Y)` 에 고정.

참고값은 §B.

### §2.4 역투영

화면 `(sx, sy)` → 그리드 `(col, row)`. 클릭 처리에 필수:

```
dy     = sy - HORIZON_Y
factor = dy / (-GROUND_Y)              // 유효 범위 체크 필요
rp     = (D / factor - D) / ROW_DEPTH
row    = floor(rp)                     // 0 <= row < ROWS
worldX = (sx - VIEW_W/2) / factor + camCenterWorldX
col    = floor(worldX / COL_W)         // 0 <= col < COLS
```

`factor` 가 `(perspFactor(ROWS), 1]` 범위 밖이면 무대 영역 아님.

---

## §3 렌더링 레이어

콘텐츠별로 비주얼은 달라지지만 *레이어 구조* 는 고정. 뒤에서 앞으로 다음 순서:

| 레이어 | 스크롤 추종 | 비고 |
|---|---|---|
| 배경 슬롯 N개 (back→front) | 콘텐츠 정의 비율 | 단순 패럴랙스, 평면 2D |
| **무대 바닥** | **수동 투영** | 텍스처를 그리드 사다리꼴에 매핑 |
| **엔티티/이펙트** | **수동 투영** | 동일 |
| **하이라이트** | **수동 투영** | 동일 |
| UI/HUD | 화면 고정 | 가장 앞 |

핵심 규칙:
- 무대 바닥/엔티티/하이라이트/이펙트는 *스크롤 추종 꺼고* 직접 투영. row 별로 다른 스크롤 추종 비율을 주는 방식은 X 압축을 못 맞춰 *일관된 1점 수렴*이 깨짐.
- 배경 슬롯은 단순 비율 스크롤로 충분. **그리드는 3D, 배경은 2D** 가 의도된 비대칭.

배경 슬롯 수와 각 스크롤 비율은 **콘텐츠가 정의** (§15).

---

## §4 매 프레임 갱신 모델

엔진의 프레임 콜백(60fps 기준)에서 다음을 순서대로:

1. 카메라 가로 스크롤 값 읽기.
2. **배경 슬롯 갱신** — 각 슬롯의 텍스처 오프셋을 `scrollX × factor` 로 이동.
3. **무대 바닥 다시 그리기** — 각 셀을 사다리꼴 텍스처 quad 로 재매핑.
4. **하이라이트 다시 그리기** — 이동/사거리/잠긴 대상/호버/AOE.
5. **엔티티 위치/스케일/z-order 갱신** — `visualCol/visualRow` 를 투영해 적용.
6. **활성 유닛 주변 떠 있는 UI 위치 갱신** — 라디얼 액션 메뉴(§6.3), facing 화살표(§6.2), 그 외 활성 유닛 부속 UI. 매 프레임 활성 유닛의 스크린 좌표를 추종.

비용은 셀 ~수십 + 엔티티 몇 명 수준이라 60fps 여유. 그리드가 커지면 가시 영역 컬링.

---

## §5 시스템 엔티티 런타임

시스템이 *모든* 엔티티에 대해 보유하는 런타임 상태. 콘텐츠가 제공할 입력 스키마는 §11.

```
{
  // 정체·논리
  id, name, side,
  col, row,                    // 그리드 점유 셀
  alive,                       // 살아있음
  fled,                        // (선택) 전장 부재
  defending,                   // 라운드 내 방어 자세
  facing,                      // ±1 좌우 방향

  // 시각 (논리와 분리)
  visualCol, visualRow,        // 애니메이션 트윈 대상
  offsetX, offsetY,            // 임시 스크린 px 변위

  // 자원
  hp, mp,                      // 현재값 (max 는 baseStats 참조)
  inventory: [{ itemId, count }],  // (선택)
  statuses: [{ id, duration, source, stacks }],

  // 게임오브젝트 핸들 (시스템 부착)
  sprite, bodySprite, hpBar, label, indicator, statusIcons, ...
}
```

### §5.1 논리/시각 좌표 분리

- `col`/`row` = **논리**. 게임 규칙(이동, 사거리, 점유) 판정.
- `visualCol`/`visualRow` = **시각**. 트윈 대상. 매 프레임 이 값으로 스프라이트 위치 산출.

이동 시: `visualCol` 을 트윈 → 도착 후 `col` 업데이트. 돌진/위빙 같은 일시 동작은 `visualCol/Row` 만 흔들고 `col` 은 안 건드림. 이 분리로 "시각은 화려하게, 논리는 안정" 이 가능.

### §5.2 `facing` 갱신 규칙

| 시점 | 갱신 방식 |
|---|---|
| 이동 트윈 직전 | 목적지 col 방향 |
| 공격/스킬(단일) 직전 | 대상 col 방향 |
| AOE / 같은 col | 변경 없음 |
| 방어/대기 후 (아군) | 사용자 선택 (`selectFacing` 모드 — §6) |
| 방어/대기 후 (AI) | 가장 가까운 상대 방향 (자동) |
| **뒤에서 피격** | 공격자 쪽으로 자동 flip (target.facing 이 공격자 반대 방향이면) |

스프라이트 컨테이너 `scaleX = facing × factor`. 자식 라벨/인디케이터는 `scaleX = facing` 로 보정해 항상 정방향. HP 바는 대칭이라 보정 불필요.

---

## §6 UI 상태 머신

단일 상태 변수 `uiMode` 가 입력/렌더/버튼 모두를 분기.

| 상태 | 진입 | 표시 | 입력 의미 |
|---|---|---|---|
| `idle` | 턴 시작 / 행동 완료 | 메인 액션 메뉴 (동적 카탈로그) | 그리드 무시, 버튼만 |
| `selectMove` | 이동 버튼 | 도달 가능 셀 강조 | 셀 클릭 → 실행 |
| `attackMode` | 공격 버튼 | 사거리 + 가능 대상 테두리 | 대상 클릭 → `pendingTarget` 잠금 |
| `skillMode` | 스킬 버튼 (단일) | 동일, 라벨만 다름 | 동일 |
| `skillAoeMode` | 스킬 버튼 (광역) | 영향 받는 모든 대상 강조 | 그리드 무시, 발동 즉시 활성 |
| `selectItem` | 도구 버튼 | 도구 목록 서브메뉴 | 도구 선택 → 해당 액션 모드 |
| `itemMode` / `itemAoeMode` | 도구 선택 후 | skill 과 동등 | 동등 |
| `selectFacing` | 방어/대기 액션 후 (아군) | 활성 유닛 좌우에 ◀/▶ 화살표 | 화살표 클릭 → facing 확정 → endTurn |
| `animating` | 액션 실행 / 전이 중 | 전 버튼 비활성 | 전 입력 무시 |

### §6.1 2단 확정 흐름

**스킬·공격 경로**:
```
[idle] ─ 공격/스킬 버튼 ─▶ [attackMode | skillMode]
                              │
                        대상 클릭 (pendingTarget 잠금)
                              ▼
                        발동 버튼 활성
                              │
                        발동 한 번 더 ─▶ [animating] ─▶ 실행 ─▶ 턴 종료
                              │
                        취소 ─▶ [idle]
```

**도구 경로**:
```
[idle] ─ 도구 버튼 ─▶ [selectItem]
                          │
                    도구 항목 선택
                          ▼
                  [itemMode | itemAoeMode]   // skill 과 동일한 2단 확정
                          │
                          ▼
                    (이하 동일)
```

**AOE 경로**:
대상이 자동 결정되는 액션은 select 단계 없이 바로 `xxxAoeMode` 진입 + 발동 버튼 즉시 활성.
```
[idle] ─ AOE 액션 버튼 ─▶ [skillAoeMode | itemAoeMode]
                              │ (모든 영향 대상 즉시 강조)
                              ▼
                        발동 버튼 클릭 ─▶ [animating] ─▶ 실행 ─▶ 턴 종료
```

원칙: **모든 발동성 액션은 미리보기 → 확정의 2단**. 즉시 발동 단축은 *명시적 예외* (이동만 해당).

**`itemMode` 가 `skillMode` 와 별도인 이유**: 비용 종류(mp 차감 vs inventory uses 차감) 와 카탈로그(SKILL_DEFS vs ITEM_DEFS) 가 다름. dispatcher 분기 명료성을 위해 모드 분리. effect 디스패치 로직은 동일.

### §6.2 `selectFacing` 흐름

방어/대기는 *대상 방향이 없는* 턴 종료 액션 → facing 사용자 선택 필요.

- **아군**: 화살표 표시 → 클릭 → facing 확정 → endTurn
- **AI**: 가장 가까운 상대 방향으로 자동 → 화살표 없이 즉시 endTurn

이동/공격/스킬/도구는 *방향이 정해진* 액션이므로 selectFacing 진입 없음. 한 턴에 facing 결정은 *한 번만* 일어남(턴 마지막 액션이 결정).

### §6.3 동적 액션 메뉴

액션 메뉴 항목은 **동적 카탈로그**:
- 기본(시스템 보장): 이동 / 공격(기본) / 방어 / 대기 / (조건부) 취소
- 캐릭터 `skills` 카탈로그(§11) 만큼 스킬 버튼
- `items` 가 비어있지 않으면 "도구" 버튼 → `selectItem` 진입
- 시나리오 `fleeAllowed` 면 "도망" 버튼

**배치 — 라디얼 (떠 있는)**: 액션 버튼은 *활성 아군 주변에 떠 있는 라디얼 레이아웃*. 하단 고정 패널이 아님. 매 프레임 활성 유닛의 스크린 좌표를 추종 (§4 단계 6), 화면 경계/하단 정보 패널 침범 방지 클램프.

- 표준 6 액션은 다이아몬드형 6점(상/좌상/우상/하/좌하/우하) 배치를 기본으로.
- 캐릭터별 스킬/도구가 늘어나면 추가 슬롯을 라디얼 또는 부채꼴로 확장.
- *비활성* 버튼은 *숨김* (회색 표시 아님). 활성 유닛 주변을 어수선하게 만들지 않기 위함.
- 활성 유닛이 *AI 또는 미정* 일 때 모든 버튼 숨김.

**의도**: 시선이 활성 캐릭터에 모인 상태에서 그 캐릭터의 선택지를 즉시 보이게 함. 어느 캐릭터의 메뉴인지 시각적으로 즉각 명확.

버튼 헬퍼: `setButton(key, enabled, label?)` — 라벨이 동적인 버튼(예: `wait` 가 "대기"/"턴 종료") 은 호출마다 라벨 동반.

### §6.4 중복 클릭 방지

비동기 액션(delay 후 endTurn 등) 핸들러 진입 시 **즉시** `uiMode = 'animating'` + 버튼 비활성. delay 동안 같은 버튼 연타로 endTurn 다중 호출 방지.

---

## §7 턴 사이클

### §7.0 인트로 시퀀스 (전투 시작)

시스템 책임. 시나리오(§15) 의 `startCamera`, `introHoldMs` 파라미터를 받아 첫 라운드 *전*에 실행:

1. 카메라를 `startCamera` 위치로 설정 (적/아군/중앙 진영 평균 worldX).
2. `introHoldMs` 머무름 (입력 잠금).
3. 반대 진영 평균 worldX 로 패닝 (이징).
4. `nextRound()` 시작.

인트로 동안 `uiMode = 'animating'`.

### §7.1 라운드/턴 흐름

```
nextRound()                                       ◀──┐
  spd 내림차순으로 turnQueue 구성                       │
  defending 등 라운드 시작 플래그 초기화                  │
  tickStatuses(all alive, 'round-end')             [§22]  │
        │                                            │
        ▼                                            │
processNextTurn() ◀──┐                               │
  사망/도망 유닛 스킵                                   │
  activeUnit = turnQueue.shift()                     │
  pendingTarget = null                               │
  tickStatuses(activeUnit, 'turn-start')           [§22]
  │  ├─ skipTurn 인 상태 있으면 → endTurn 으로 즉시 점프  │
  │  └─ 아니면 계속                                     │
  character.hooks.onTurnStart?(scene, self)        [§20]  │
  카메라 pan → 활성 위치                               │
  아군: uiMode = 'idle' → 플레이어 입력 → Intent      [§17]
  AI:   ai.decide(scene, self, world) → Intent     [§14·§17]
        │                                            │
        ▼                                            │
  dispatcher: Intent 검증 → effect 디스패치          [§17·§18]
        │   (애니메이션/이펙트 오케스트레이션)            │
        ▼                                            │
endTurn()                                            │
  tickStatuses(activeUnit, 'turn-end')             [§22]  │
  uiMode = 'animating'                                │
  delay → processNextTurn ──────────────────────────┘

종료 조건: endBattle(reason)
  reason: 'victory'  — 적 진영 전체 alive=false 또는 fled
        | 'defeat'   — 아군 진영 동일
        | 'flee'     — 아군 전체 도망 성공 (시나리오 정책)
```

라운드 종료 조건: `turnQueue` 가 비고 누구도 행동 안 함 → 다음 라운드.

`[§N]` 표시는 해당 단계가 호출하는 명세 절. 콘텐츠 호출 지점(`hooks`, `ai.decide`) 과 시스템 자체 동작(turn queue, dispatcher) 이 같은 흐름도에 표시됨.

---

## §8 입력 처리

### §8.1 두 계층 — UI 객체 vs 그리드

입력은 두 계층으로 처리:

1. **UI 객체** (자체 인터랙티브): 라디얼 액션 버튼, `selectFacing` 화살표, 도구 서브메뉴, 상태 정보 패널 등. 각 객체가 자체 `pointerdown` 콜백을 가지고 **이벤트 전파 차단** (`stopPropagation`) 으로 그리드 계층에 전달되지 않게 함.
2. **그리드 계층** (글로벌 포인터다운 리스너 1개): UI 객체에 의해 소비되지 않은 클릭만 도달. 그리드 위 엔티티/셀 클릭을 처리.

UI 객체의 위치(하단 패널, 화면 상단, 캐릭터 주위 라디얼 등)는 시스템 결정 — *위치와 무관하게* 자체 인터랙티브 + 전파 차단 규약을 따름.

### §8.2 그리드 히트테스트

UI 객체가 클릭을 소비하지 않았을 때 글로벌 핸들러가 처리:

1. **스프라이트 바운딩 박스 히트테스트 우선** (앞→뒤 순). 뒤쪽 row 엔티티의 그림자/머리 끝이 다른 row 의 셀로 계산되는 회피 케이스 방지.
2. 빗나가면 역투영으로 셀 산출 → 그 셀의 점유 엔티티 검색.

호버 표시는 매 호출마다 clear → 재그림. 모드 전환 시 잔상 방지를 매 프레임 갱신이 보장.

### §8.3 모드별 입력 잠금

| 모드 | 그리드 클릭 | UI 객체 클릭 |
|---|---|---|
| `idle` | 무시 | 액션 버튼만 |
| `selectMove`/`attackMode`/`skillMode`/`itemMode` | 셀/대상 클릭 활성 | 액션 버튼 (취소·발동) |
| `skillAoeMode`/`itemAoeMode` | 무시 | 발동·취소 버튼 |
| `selectItem` | 무시 | 도구 서브메뉴 |
| `selectFacing` | 무시 | ◀/▶ 화살표만 |
| `animating` | 무시 | 전부 무시 |

---

## §9 시각 표현 — 시스템 책임 범위

시스템이 *직접* 제공하는 비주얼 메커니즘. 구체적인 색·형상·타이밍은 콘텐츠 디스크립터(§12) — 본 절은 *메커니즘* 만.

### §9.1 무대 바닥 텍스처 매핑

각 셀 `(col, row)` 의 네 모서리를 `project()` 로 산출 → 사다리꼴에 콘텐츠 정의의 바닥 텍스처를 매핑. 모든 셀이 자신의 사다리꼴에 텍스처를 stretch → 깊이 압축 자동.

튜닝 노브 (콘텐츠가 조절):
- `PRE` — 셀당 텍스처 반복 횟수. 작을수록 셀당 큰 타일.
- `SUBDIV` — 한 셀을 N×N 으로 분할해 각 서브셀에 별도 매핑. 클수록 어파인 매핑 왜곡 감소.
- `VISUAL_PAD` — `[0, COLS)` 너머로 추가 그리는 셀 수. 화면 모서리의 검정 공백 제거 (게임 로직 영향 없음).

### §9.2 엔티티 컨테이너

엔티티는 컨테이너(또는 동등한 그룹) GameObject. 매 프레임:

- **위치**: `(visualCol + 0.5, visualRow + α) → project() + offsetX/Y`
  (α 는 콘텐츠 스프라이트의 발 위치 보정 — 보통 0.5~0.7)
- **스케일**: `(facing × factor, factor)` — `factor` 는 셀 중심의 perspective factor. 깊이 자동 축소.
- **z-order**: 매 프레임 `visualRow` 내림차순 정렬 — 앞 엔티티가 뒤 위에 그려짐.

자식 슬롯 (시스템이 부착, 콘텐츠가 채움):

| 슬롯 | 역할 |
|---|---|
| 본체 비주얼 | 콘텐츠 정의 (스프라이트/스프라이트셋/도형 합성 자유) |
| 그림자 | (선택) 본체 하단 |
| HP 바 | 본체 상단 |
| 이름 라벨 | HP 바 위 |
| 턴 인디케이터 | 활성 턴에만 표시 |
| 상태 아이콘 슬롯 | 적용된 상태들의 아이콘 (§22) |

**좌향/우향 보정**: 컨테이너 scaleX 가 `facing` 으로 뒤집힘. 텍스트(라벨)나 정방향 필요 자식은 `scaleX = facing` 으로 재보정.

### §9.3 활성 유닛 부속 UI

엔티티 컨테이너의 *자식이 아닌* 별도 스크린 좌표 객체. 매 프레임 활성 유닛의 스크린 위치를 추종 (§4 단계 6):

| 부속 UI | 진입 조건 | 위치 |
|---|---|---|
| 라디얼 액션 메뉴 (§6.3) | 활성 유닛 == 아군 AND uiMode 가 액션 입력 허용 | 캐릭터 발 기준 다이아몬드 |
| `selectFacing` ◀/▶ 화살표 (§6.2) | `selectFacing` 모드 AND 활성 유닛 == 아군 | 캐릭터 좌우 |

특성:
- 컨테이너 자식이 아니므로 `facing` flip 의 영향을 받지 않음.
- 캐릭터 스케일(perspective factor)과 *무관*하게 *고정 크기*로 표시 — 깊이와 상관없는 가독성 보장.
- 매 프레임 위치 재계산 → 카메라 패닝 / 캐릭터 이동에도 자연스럽게 추종.

### §9.4 애니메이션 상태 머신

콘텐츠가 `visual.anims` 맵에 정의한 키가 곧 가능 상태. 표준 상태:

| 상태 | 트리거 | 루프 | 종료 처리 |
|---|---|---|---|
| idle | 기본 / 액션 완료 | ○ | - |
| walk | 이동 트윈 시작 | ○ | 도착 시 idle |
| attack | 공격 발동 | ✕ | 완료 시 idle |
| cast | 스킬/도구 발동 | ✕ | 완료 시 idle |
| hit | 피격 (사망 아닐 때) | ✕ | 완료 시 idle |
| dead | 피격 후 hp ≤ 0 | ✕ | **마지막 프레임 정지** (회전 없음) |

각 상태는 *선택*. 미정의 시 시스템 폴백.

**state 별 anchorY 보정**: 같은 캐릭터라도 anim 간 프레임 내 발 위치가 다를 수 있음. anim 항목에 `anchorY` 오버라이드 시 시스템이 sprite.y 자동 보정해 발 위치 일정 유지.

### §9.5 액션 동기화 — `waitForActionAnim`

트윈 시간과 anim 길이가 다를 수 있어 (특히 cast 가 길고 dash 가 짧음), 액션 종료는 *둘 다 끝난 시점* 에 동기:

- 스프라이트 엔티티: anim 완료 이벤트 1회성 리스너를 anim 시작 *직후* 등록.
- 폴백 (anim 없음): `fallbackMs` delay 로 대체.
- 근접: dash 트윈도 별도 카운팅. dash·anim 둘 다 끝나야 endTurn (플래그 카운팅).

**핵심**: 리스너는 anim 시작 *직후* 등록. 트윈 완료 후 등록하면 이미 anim 이 끝난 케이스에서 영원히 호출 안 됨.

### §9.6 시스템 이펙트 프리미티브

구체 비주얼은 콘텐츠가 정의 (§12 `fx` 디스크립터). 시스템은 다음 *프리미티브* 만 제공:

```
popDamage(x, y, dmg, blocked)            // 데미지 텍스트 부상
hitEffect(x, y, scale)                   // 피격 임팩트 (기본 형태)
spellEffect(x, y, color, scale)          // 스킬 임팩트 (기본 형태)
cameraFlash(duration, r, g, b)
cameraShake(duration, intensity)
hitShake(target)                          // offsetX -8/0 yoyo repeat 2
hitTint(target, color, ms)                // 빨간 tint 또는 박스 오버레이 폴백
```

**임팩트 크기 규칙**: 모든 임팩트 이펙트는 *대상 셀의 perspective factor 에 비례*. 뒤쪽 적의 이펙트는 시각적으로 작아짐.

**액션 종료 패턴 — 근접 vs 원거리**:
- 사거리 1 = 돌진: `visualCol/Row` 를 대상 인접 셀까지 트윈 → 임팩트 → 원위치 트윈 (논리 좌표는 그대로).
- 사거리 > 1 = 제자리 발사.

### §9.7 하이라이트 시멘틱

모든 하이라이트는 셀의 네 모서리를 투영한 *사다리꼴 폴리곤*.

| 의미 | 권장 시각 |
|---|---|
| 이동 가능 셀 | 밝은 녹색 채움 + 테두리 |
| 적 액션 사거리 (포괄) | 옅은 분홍/적색 채움 |
| 아군 액션 사거리 (회복 등) | 옅은 청록/녹색 채움 |
| 사거리 내 유효 대상 | 굵은 테두리 |
| **잠긴 대상** (`pendingTarget`) | 채움 + **노란/금색 굵은 테두리** — "확정 직전" 시그널 |
| 호버 | 흰색 굵은 테두리 |
| AOE 영향 대상 | 잠긴 대상과 동일 강조 |

색상은 콘텐츠 튜닝 가능. **시멘틱 구별**(특히 잠긴 대상은 다른 의미와 시각적으로 구별)은 시스템 일관성을 위해 유지.

---

# 2부 · 콘텐츠 인터페이스

시스템은 콘텐츠를 카탈로그 형태로 받아 합성한다. 콘텐츠 자체는 시스템과 독립이며, *데이터만 추가* 로 새 캐릭터·스킬·상태를 도입할 수 있어야 함.

---

## §10 콘텐츠 슬롯 개요

| 카탈로그 | 정의 | 시스템 사용처 |
|---|---|---|
| `CHARACTER_DEFS` | 캐릭터 사양 | 엔티티 생성, 스탯, 비주얼, 메뉴 항목 |
| `SKILL_DEFS` | 스킬·기본 공격 | 액션 메뉴, effect 디스패치 |
| `ITEM_DEFS` | 도구 | 도구 메뉴, effect 디스패치 |
| `STATUS_DEFS` | 상태(버프/디버프) | 상태 엔진, modifier, tick |
| `AI_PROFILES` | AI 결정 로직 | 적 턴 |
| `SCENARIO` | 한 전투의 배치·배경·바닥 | 씬 초기화 |

새 콘텐츠 추가의 정의:
- **데이터 추가만으로 가능** = 시스템 코드는 변경 없음.
- 시스템 코드 변경이 필요한 추가는 §25 "시스템 확장 패턴" 으로 분류.

---

## §11 캐릭터 정의 스키마 (`CHARACTER_DEFS[id]`)

```
{
  id, name, side,                       // 식별 + 진영

  baseStats: { hp, mp, atk, def, spd, move, range },

  visual: {
    sheet, scale, anchorX, anchorY, hudY,
    anims: {                            // 상태 → animation key 맵
      idle, walk, attack, cast, hit, dead    // 각 항목 { key, anchorY? }
    }
  },

  basicAttack: skillId,                 // 메뉴 "공격" 버튼이 발동하는 SKILL_DEFS 참조 (필수)
  skills:      [ skillId, ... ],        // 추가 스킬들 (basicAttack 제외, 선택)
  items:       [ { itemId, count }, ... ],   // 도구 인벤토리 (선택)
  ai:          aiProfileId,             // AI_PROFILES 참조

  flee:        { chance },              // (선택) 도망 확률 0..1 — §15 fleeAllowed 와 함께 작용

  hooks: {                              // (선택) 라이프사이클 훅 — §20
    onTurnStart?(scene, self),
    onHit?(scene, self, attacker, dmg),
    onDeath?(scene, self, killer)
  }
}
```

`anims` 의 각 항목은 *선택*. `hit` 가 없으면 피격 시 anim 전환 없이 시각 피드백만, `dead` 가 없으면 폴백 사망 처리.

**`basicAttack` vs `skills`**:
- `basicAttack` = 메뉴의 *고정 "공격" 버튼* 이 발동. SKILL_DEFS 의 한 항목이지만 *비용 0* 인 경우가 일반적 (`cost: {}`).
- `skills` = 메뉴의 *동적 스킬 버튼들*. 각각 mp 비용 / 라벨 / 패턴 자유.
- 시스템 입장에서 둘 다 SKILL_DEFS 참조 — *어떤 메뉴 버튼에 매핑되는지* 만 다름. effect 디스패치 경로는 동일.

**도망 가능 조건**: `SCENARIO.fleeAllowed === true` AND `character.flee.chance` 존재. 둘 다 만족할 때만 도망 버튼 표시.

---

## §12 스킬/도구 정의 스키마 (`SKILL_DEFS[id]`, `ITEM_DEFS[id]`)

스킬과 도구는 *거의 같은* 스키마. 다른 점은 *비용 종류* 와 *카탈로그* 만:

```
{
  id, name,
  pattern:    'single' | 'aoe' | 'line' | 'cross' | 'self',
  range,
  targetSide: 'enemy' | 'ally' | 'any' | 'self',

  cost: { mp? | uses? },                // 스킬은 mp, 도구는 uses (1회 1차감)

  casterAnim:   'cast' | 'attack' | ...,   // 발동 시 caster 가 재생할 anim
  impactDelay:  ms,                     // anim 의 실제 타격 프레임과 동기

  effects: [ EffectDescriptor, ... ],   // §18 — 한 액션이 여러 effect

  fx: {                                 // 시각 이펙트 파라미터
    color, flash?, shake?, particleType?, perTargetStagger?, ...
  },

  customExecute?(scene, caster, targets, sys)   // 표준 패턴 안 맞을 때만
}
```

표준 `pattern` 은 시스템 내장 실행기 (§19 `ACTION_PATTERNS`). 콘텐츠는 보통 데이터로 표현 가능, 특수 스킬만 `customExecute` 로 직접 구현 (이때도 시스템 공개 API 만 사용).

---

## §13 상태 정의 스키마 (`STATUS_DEFS[id]`)

```
{
  id, category: 'buff' | 'debuff' | 'neutral',
  icon, color,                          // HUD 상태 아이콘

  duration: { ticks, refreshOn?: 'apply' | 'never' },
  stacks:   { max, behavior: 'replace' | 'add' | 'refresh' },

  modifiers: {                          // 스탯 수정자 — getStat 에 반영
    atk?, def?, spd?, move?, range?,    // 정수 또는 '+30%' / '-50%' 같은 문자열
  },

  tick: {                               // 주기적 효과
    on: 'turn-start' | 'turn-end' | 'round-end',
    effects: [ EffectDescriptor, ... ]
  },

  skipTurn: bool,                       // 스턴류 — true 면 활성 턴 스킵
  removeOn: { hit?, heal?, turnEnd? }   // 자동 해제 조건
}
```

---

## §14 AI 프로필 인터페이스 (`AI_PROFILES[id]`)

```
{
  id,
  decide(scene, self, world) -> Intent
}
```

`world` 는 시스템이 제공하는 읽기 전용 컨텍스트:
```
{
  allies, enemies,                      // alive 만
  manhattan(a, b),
  getReachableCells(u),
  getValidTargets(u, range, side),
  getStat(u, name),
  ...
}
```

`decide` 는 반드시 `Intent` 반환 (§17). 시스템이 그 Intent 를 받아 검증·실행. AI 코드가 *직접* `executeAttack` 같은 시스템 메서드를 호출하지 않음 — *결정* 과 *실행* 분리.

표준 AI 패턴 *예시* (참고 구현):
1. 가장 가까운 적 찾기 (맨해튼)
2. 사거리(기본 OR 스킬) 안 → 일정 확률로 스킬, 아니면 기본 공격. 둘 다 못하면 방어
3. 사거리 밖 → 한 칸씩 가장 가까워지는 방향으로 `move` 만큼 전진

이건 *한 가지 프로필* 의 예. 시스템은 어떤 decide 함수든 받아 들임.

---

## §15 시나리오 정의 (`SCENARIO`)

```
{
  participants: [
    { charId, side, col, row },         // 시작 배치
    ...
  ],

  backgrounds: [
    { key, scrollFactor }, ...          // back → front 순. 슬롯 수·비율 콘텐츠 결정
  ],

  floor: {
    texture,                            // 타일링 가능 권장
    params: { PRE, SUBDIV, VISUAL_PAD, ... }
  },

  fleeAllowed: bool,
  startCamera: 'enemy' | 'ally' | 'center',  // 인트로 시작 위치
  introHoldMs: number,                  // 인트로 머무름 시간
}
```

---

# 3부 · 시스템↔콘텐츠 통신

콘텐츠와 시스템은 명시적 4 축으로만 통신한다. 콘텐츠가 시스템 내부 상태(`uiMode`, `turnQueue` 등)를 *직접* 만지는 것은 금지.

---

## §16 통신의 4축

| 축 | 방향 | 형태 | 예 |
|---|---|---|---|
| **A** 데이터 읽기 | 시스템 → 콘텐츠 | 정적 프로퍼티 | `entity.baseStats.atk`, `skill.range`, `visual.anims.cast.key` |
| **B** 콜백 호출 | 시스템 → 콘텐츠 | 함수 호출 | `ai.decide(...)`, `skill.customExecute(...)`, `hooks.onHit(...)` |
| **C** 시스템 API 호출 | 콘텐츠 → 시스템 | 메서드 호출 | `scene.applyDamage(t, dmg)`, `scene.spellEffect(...)` |
| **D** Intent | 콘텐츠 → 시스템 | 객체 반환 | `{ kind:'skill', skillId, targetId }` |

**규약**:
- 콘텐츠는 시스템 내부 상태를 *직접* 변경하지 않음.
- 콘텐츠가 효과를 일으키려면 *시스템 공개 API* (§19) 만 사용.
- 콘텐츠가 행동을 표현하려면 *Intent* (§17) 반환.
- 시스템은 콘텐츠 데이터/콜백을 *읽고 호출* 만 함.

이 4축 외의 통신은 시스템/콘텐츠 경계 침범으로 간주.

---

## §17 Intent 명세

행동 의도를 표현하는 객체. 플레이어 입력과 AI 결정이 *같은 형식*으로 발행 → 시스템 dispatcher 가 통일된 코드로 처리.

```
{ kind: 'move',    dest: {col, row} }
{ kind: 'attack',  targetId }                                  // basicAttack 단축
{ kind: 'skill',   skillId, targetId | targetIds[] }
{ kind: 'item',    itemId,  targetId | targetIds[] }
{ kind: 'defend',  facing? }
{ kind: 'wait',    facing? }
{ kind: 'flee' }
```

**`attack` 은 `skill` 의 단축**: `{kind:'attack', targetId}` 는 `{kind:'skill', skillId: character.basicAttack, targetId}` 와 의미상 동등. dispatcher 가 `attack` 을 받으면 활성 유닛의 `basicAttack` 으로 풀어 skill 경로로 실행. 플레이어 메뉴와 AI 가 *둘 중 어느 형식이든* 발행 가능.

- 플레이어 입력 흐름(uiMode 전이) → Intent 발행 → dispatcher
- AI `decide(...)` → Intent 반환 → 같은 dispatcher
- (미래) 리플레이/네트워크 → 동일 Intent 스트림 → 같은 dispatcher

`facing?` 은 턴 종료성 액션(defend/wait)에서 selectFacing 결과. AI 가 발행하는 Intent 는 이 필드를 비워두면 시스템이 자동 결정 (가까운 상대 방향).

**시스템 책임**: dispatcher 가 Intent 를 받아 (1) 유효성 검증 (2) 애니메이션/이펙트 오케스트레이션 (3) 턴 종료 처리.

---

## §18 Effect 디스크립터

한 액션이 effects 리스트를 가짐. 시스템 effect dispatcher 가 `kind` 별 분기:

```
{ kind: 'damage',       mult,   element? }
{ kind: 'heal',         amount | mult }
{ kind: 'applyStatus',  statusId, duration, chance? }
{ kind: 'removeStatus', filter: { id? | category? } }
{ kind: 'fx',           fxKey, args }              // 추가 시각 효과
```

새 `kind` 도입 시 effect dispatcher 에 1줄 추가.

**합성 예** — 한 스킬이 데미지 + 화상 부여:
```
effects: [
  { kind: 'damage',      mult: 1.5 },
  { kind: 'applyStatus', statusId: 'burn', duration: 3, chance: 0.7 }
]
```

**도구 예** — 해독초 (디버프 해제):
```
effects: [{ kind: 'removeStatus', filter: { category: 'debuff' } }]
```

스킬·도구·상태 tick 모두 *같은 effect 언어* 를 공유. 이게 콘텐츠를 데이터로 표현 가능하게 만드는 핵심.

---

## §19 시스템 공개 API

콘텐츠 (customExecute, hooks, ai 의 일부) 가 호출 가능한 시스템 메서드. 콘텐츠 코드는 *이 표면만* 사용:

```
// 좌표·투영
scene.project(col, rp)            -> { x, y, factor }
scene.screenToCell(sx, sy)        -> {col, row} | null

// 사거리·점유
scene.getReachableCells(u)        -> Cell[]
scene.getValidTargets(u, range, side)  -> Entity[]
scene.isOccupied(col, row, exclude?)   -> bool

// 효과 (상태 변화)
scene.applyDamage(target, dmg, source?)
scene.applyHeal(target, amount, source?)
scene.applyStatus(target, statusId, duration, source?)
scene.removeStatus(target, filter)

// 스탯 해석
scene.getStat(u, name)            -> number      // §21

// 비주얼
scene.playEntityAnim(u, stateKey)
scene.waitForActionAnim(u, key, fallbackMs, onDone)
scene.faceTowardCol(u, col)
scene.hitEffect(x, y, scale)
scene.spellEffect(x, y, color, scale)
scene.popDamage(x, y, dmg, blocked)

// 카메라
scene.panCameraTo(worldX, duration)         -> Promise
scene.cameraFlash(duration, r, g, b)
scene.cameraShake(duration, intensity)

// 로그
scene.log(msg)
```

내부 메서드 (`uiMode` 전이, `turnQueue` 조작, `endTurn` 직접 호출 등) 는 공개 API 가 *아님*. 콘텐츠에서 호출 금지.

---

## §20 라이프사이클 훅

콘텐츠가 *선택적* 으로 제공. 시스템이 시점에 호출. 미정의 시 시스템 폴백:

| 훅 | 호출 시점 | 시그니처 | 폴백 |
|---|---|---|---|
| `character.hooks.onTurnStart` | processNextTurn 진입, status tick 후 | `(scene, self)` | 미동작 |
| `character.hooks.onHit` | applyDamage 표준 처리 *후* | `(scene, self, attacker, dmg)` | 미동작 |
| `character.hooks.onDeath` | hp ≤ 0 확인 시 | `(scene, self, killer)` | 시스템 표준 dead anim / 폴백 |
| `skill.customExecute` | 발동 시 (표준 effect 패턴 대신) | `(scene, caster, targets, sys) -> Promise` | 표준 effect 디스패치 |
| `status.tick` 내 `customEffect?` | 해당 tick 시점 | `(scene, target)` | tick.effects 디스패치 |

훅은 시스템 공개 API(§19) 만 사용. 시스템 내부 상태에 손대지 않음.

---

## §21 스탯 해석 레이어 (`getStat`)

```
scene.getStat(u, 'atk') =
  base.atk
  * (1 + Σ buff.modifiers.atk%   - Σ debuff.modifiers.atk%)
  + Σ flat.modifiers.atk
```

**모든** 데미지/사거리/이동/속도 계산은 `getStat` 경유. 직접 `u.atk` 접근 *금지*. 버프/디버프 콘텐츠가 없어도 이 레이어를 통해 접근하면 추후 도입이 무중단.

해석 시점: 사용 시점 (lazy). 캐시 없음 — 상태는 자주 바뀌고 호출 비용은 작음.

기준이 되는 `name` 키: `hp_max`, `mp_max`, `atk`, `def`, `spd`, `move`, `range`. 콘텐츠 확장 시 새 키 추가 가능.

---

## §22 상태 엔진 라이프사이클

- **적용**: `applyStatus(target, statusId, duration, source)` — `target.statuses` 에 추가. `stacks.behavior` 에 따라 replace/add/refresh.
- **tick**:
  - `processNextTurn` 시작: `tickStatuses(active, 'turn-start')` — 독뎀, 스턴 체크 (`skipTurn` 이면 행동 없이 endTurn)
  - `endTurn` 직전: `tickStatuses(active, 'turn-end')` + duration 1 감소
  - `nextRound` 시작: `tickStatuses(*, 'round-end')`
- **만료**: duration 0 도달 시 자동 제거. 또는 `removeOn` 조건 충족 시.
- **수동 제거**: `removeStatus(target, filter)` — `filter` 는 id 매칭 또는 category 매칭.
- **시각**: HUD 의 상태 아이콘 슬롯에 표시. 시스템이 자리잡고, 콘텐츠가 `icon`/`color` 제공.
- **스탯 영향**: `modifiers` 가 `getStat` 에 자동 반영.

---

# 4부 · 확장과 검증

---

## §23 디자인 의도 (구현 시 보존 필수)

- **양 끝에서 시작 → 점진 전진 → 사거리 격돌** 이 핵심 연출. 시작 위치를 가깝게 잡거나 사거리를 너무 길게 풀면 *양식이 무너짐*. 행진감이 의도된 디자인.
- **2단 확정 UX** 는 SRPG 의 핵심 미감 — 적용 범위를 *눈으로 본 뒤* 확정. 즉시 발동 단축 흐름은 의도적으로 *제거됨*. 다시 넣지 말 것.
- **1점 투시 격자** 는 시각적 정체성. 스크롤 추종 비율 같은 트릭으로 흉내내면 안 됨. 매 프레임 직접 투영.
- **2D 엔티티 + 3D 무대** 의 비대칭이 의도. 엔티티를 3D 메쉬로 바꾸거나 무대를 2D 격자로 평탄화하지 않음.
- **콘텐츠 ≠ 시스템**. 배경/바닥/엔티티 비주얼/스킬/상태/AI/도구는 매번 바뀌는 *콘텐츠*. 본 명세는 *그 콘텐츠가 어떻게 그리드/투영/턴/UI/통신에 꽂히는지* 만 규정. 특정 그림체·팔레트·세계관·메커니즘에 의존하지 않음.
- **통신은 4축으로 제한**. 콘텐츠는 시스템 내부에 손대지 않음. 이 경계가 무너지면 콘텐츠를 교체 가능한 *재사용 시스템 템플릿* 의 가치가 사라짐.

---

## §24 알려진 제약

- 사망 엔티티는 시체 스프라이트가 그대로 남음 (시각). 다른 엔티티가 그 셀로 이동하면 시각 겹침 가능 (논리는 alive 체크로 안전).
- 세로 카메라 없음. row 수가 많아져도 한 화면에 다 보여야 함. 도입 시 투영이 카메라 Y 도 받도록 확장 필요.
- 트윈 충돌: `visualCol/Row` 는 한 시점에 하나의 트윈만. 새 트윈 시작 전 기존 종료.
- 동적 라벨 버튼: `setButton(key, enabled)` 만 호출하면 라벨 이전 값 유지. 라벨 동적 버튼은 호출마다 라벨 동반.
- 모드 전환 시 호버 잔상이 남는 케이스. 매 프레임 호버 graphic clear 보장 필요.
- 카메라 줌 미지원 (줌 = 1 가정). 도입 시 역투영·히트테스트에 줌 보정 추가.

---

## §25 확장 패턴

### 콘텐츠 추가 (데이터만 — 시스템 코드 무변경)
- **새 캐릭터**: `CHARACTER_DEFS` 항목 + 시나리오 `participants` 배치.
- **새 스킬/도구**: `SKILL_DEFS` / `ITEM_DEFS` 항목. `pattern` 이 표준이면 데이터만.
- **새 상태**: `STATUS_DEFS` 항목. `modifiers` / `tick` 으로 표현 가능한 한 데이터만.
- **새 AI**: `AI_PROFILES` 항목. `decide` 함수 정의.
- **새 시나리오**: `SCENARIO` 객체.

### 시스템 확장 (코드 변경 필요)
- **새 액션 패턴** (line/cross 미지원이라면): `ACTION_PATTERNS` 카탈로그에 실행기 추가. 콘텐츠는 `pattern` 키로 지정.
- **새 effect kind** (예: teleport, summon): effect dispatcher 1줄 추가.
- **새 UI 상태**: 메뉴 갱신 / 하이라이트 / 포인터다운 / 포인터무브 4 곳 동기화. `animating` 상태에선 모든 입력 잠금.
- **그리드/해상도 변경**: `COLS`/`ROWS`/`VIEW_W`/`VIEW_H` 조정 + 원근 파라미터 재튜닝. row 가 많아지면 `D` 키우거나 `ROW_DEPTH` 줄여 압축 완화.
- **카메라 줌**: 역투영·히트테스트에 줌 보정.
- **세로 카메라**: 투영 함수에 카메라 Y 인자 추가.

---

## §26 구현 체크리스트

### 시각 확인
- [ ] 세로 격자선이 화면 중앙 단일 소실점으로 수렴
- [ ] 카메라 스크롤 시 소실점이 화면 중앙에 머무름
- [ ] 뒤쪽 row 엔티티가 앞쪽 row 보다 시각적으로 작음
- [ ] 양 끝 시작 → 가운데 행진 → 사거리 격돌 흐름
- [ ] 2단 확정: 액션 → 범위 시각화 → 잠금 (노란 테두리) → 확정
- [ ] AOE: 대상 선택 없이 모든 영향 대상 즉시 강조
- [ ] 취소 시 메인 메뉴 복귀, 잔상 없음
- [ ] 배경 슬롯 패럴랙스 (서로 다른 속도)
- [ ] 무대 바닥 사다리꼴 깊이 압축 (격자선 제거 시에도 동일)
- [ ] 데미지 적용 시 popDamage + 피격 흔들기 + tint(스프라이트) / 박스 플래시(폴백)
- [ ] 사망 시 dead anim 마지막 프레임 정지 (회전 없음) / 폴백
- [ ] hit anim 있으면 피격 시 재생, 살아남으면 idle 복귀
- [ ] 이동/공격/스킬 직전 facing 갱신
- [ ] 방어/대기 후 ◀/▶ 화살표 표시 (아군만)
- [ ] 뒤에서 피격 시 공격자 쪽으로 facing 자동 flip
- [ ] 액션 메뉴가 활성 아군 주변에 떠서 표시 (라디얼), 캐릭터 이동/카메라 패닝에 따라 추종
- [ ] 비활성 버튼은 *숨김* (회색 비활성 표시 없음)
- [ ] AI 턴/animating/selectFacing 중 액션 메뉴 전체 숨김

### 기능 확인
- [ ] 맨해튼 거리 기반 이동/사거리 판정
- [ ] 점유 충돌 (같은 셀 금지)
- [ ] spd 기반 턴 순서 (라운드마다 재정렬)
- [ ] 한 진영 전멸/도망 시 endBattle (reason 별 분기)
- [ ] 다중 스킬 캐릭터: 동적 메뉴 구성
- [ ] 도구 메뉴 → selectItem → 효과 발동
- [ ] 회복 도구가 아군 타겟팅, 색 다른 사거리 강조
- [ ] 상태 적용 / tick / 만료 / 제거 / HUD 아이콘 갱신
- [ ] 모든 데미지/사거리 계산이 `getStat` 경유 (직접 `u.atk` 접근 없음)
- [ ] 동일 Intent 가 플레이어와 AI 양쪽에서 같은 dispatcher 로 처리됨 (Intent 로그 비교)
- [ ] 도망 시도: 성공 → endBattle('flee') 또는 unit fled 처리 / 실패 → endTurn

### 통신 경계 확인
- [ ] 콘텐츠 코드(skill.customExecute, hooks, ai.decide) 가 시스템 내부 상태 미변경
- [ ] 콘텐츠가 효과를 일으킬 때 §19 공개 API 만 사용
- [ ] 새 캐릭터/스킬/상태 추가가 데이터 변경만으로 동작 (시스템 코드 무수정)

---

# 부록

## §A Phaser 3 매핑 (참고 구현)

본 명세를 Phaser 3 단일 씬으로 구현할 때의 API 매핑:

| 명세 용어 | Phaser API |
|---|---|
| 프레임 콜백 | `Scene.update()` |
| 카메라 가로 스크롤 값 | `this.cameras.main.scrollX` |
| 카메라 panning | `tweens.add({ targets: cam, scrollX, ease, duration })` |
| 카메라 플래시/셰이크 | `cameras.main.flash(...)`, `cameras.main.shake(...)` |
| 스크롤 추종 비율 | `obj.setScrollFactor(α, 1)` |
| 트윈 | `tweens.add({ targets, prop, duration, ease, onComplete })` |
| 다각형 채움/테두리 | `Graphics.beginPath/moveTo/lineTo/closePath/fillPath/strokePath` |
| 좌표 그라데이션 | `Graphics.fillGradientStyle(...)` + `fillRect` |
| 컨테이너 + 자식 | `add.container(x, y).add([...])` |
| 입력 | `input.on('pointerdown'/'pointermove', ...)` |
| 인터랙티브 게임오브젝트 | `obj.setInteractive(...).on('pointerdown', ...)` |
| 이벤트 전파 차단 | `event.stopPropagation()` |
| 텍스트 | `add.text(x, y, str, { fontSize, color, stroke, ... })` |
| 배경 슬롯 (가로 반복) | `add.tileSprite(...)` + `tilePositionX = scrollX × factor` |
| 동적 캔버스 텍스처 | `textures.createCanvas(key, w, h)`, `canvasTex.getContext()`, `canvasTex.refresh()` |
| anim 완료 이벤트 | `'animationcomplete-<key>'` (anim 시작 *직후* once 리스너) |

---

## §B 참고 콘텐츠 카탈로그

*이 절은 본 명세의 일부가 아니라, 시각적 균형이 검증된 *참고값*. 새 구현·새 콘텐츠에서는 다시 튜닝.*

### 시스템 파라미터 (시각 균형 검증값)
```
VIEW_W = 960, VIEW_H = 600
COLS = 12, ROWS = 4, COL_W = 150, WORLD_W = 1800
D = 680, ROW_DEPTH = 180
HORIZON_Y = 200, GROUND_Y = -320
PANEL_Y = 532
무대 바닥: SUBDIV = 2, VISUAL_PAD = 6
```

### 배경 패럴랙스 비율 (6 슬롯, back→front)
```
0.04, 0.12, 0.22, 0.34, 0.46, 0.58
```

### 인트로 시퀀스 타이밍
- 적 진영 머무름: ~1.6s
- 아군 진영으로 패닝: ~1.1s (ease-in-out)
- 패닝 완료 후 첫 라운드.

### 라디얼 액션 메뉴 — 6 액션 다이아몬드 오프셋
활성 유닛 발 위치 기준, 스크린 px:
```
공격:   ( +0,  -120)    // 정상
이동:   (-110,  -95)    // 좌상
스킬:   (+110,  -95)    // 우상
방어:   (-110,  +35)    // 좌하
취소:   (+110,  +35)    // 우하
대기:   ( +0,   +60)    // 정하
```
버튼 크기 72×26 px, 화면 경계 클램프 (좌우 44px, 상단 56px, 하단 정보 패널 -16px).

### 콘텐츠 인라인 예시

*아래는 §11~§15 스키마를 채우는 *최소 동작* 예시. 새 콘텐츠에서는 자유롭게 대체.*

#### 캐릭터 — `melee_swordsman` (아군 / 근접 + 단일 스킬)
```
{
  id: 'melee_swordsman', name: '소드맨', side: 'ally',
  baseStats: { hp: 140, mp: 50, atk: 28, def: 14, spd: 12, move: 3, range: 1 },
  visual: {
    sheet: 'swordsman', scale: 4,
    anchorX: 0.5, anchorY: 0.98, hudY: -200,
    anims: {
      idle:   { key: 'sm-idle' },
      walk:   { key: 'sm-walk' },
      attack: { key: 'sm-attack' },
      cast:   { key: 'sm-cast', anchorY: 0.99 },
      hit:    { key: 'sm-hit' },
      dead:   { key: 'sm-dead' },
    },
  },
  basicAttack: 'basic_slash',
  skills: ['radiant_slash'],
  ai: 'melee_rusher',
}
```

#### 캐릭터 — `ranged_mage` (아군 / 원거리 + 광역 스킬)
```
{
  id: 'ranged_mage', name: '메이지', side: 'ally',
  baseStats: { hp: 90, mp: 110, atk: 14, def: 8, spd: 14, move: 2, range: 5 },
  visual: { sheet: 'mage', scale: 4, anchorX: 0.5, anchorY: 0.98, hudY: -200,
            anims: { idle: {key:'mg-idle'}, walk: {key:'mg-walk'},
                     attack: {key:'mg-attack'}, cast: {key:'mg-cast'},
                     hit: {key:'mg-hit'}, dead: {key:'mg-dead'} } },
  basicAttack: 'magic_bolt',
  skills: ['flare'],
  items: [{ itemId: 'antidote', count: 2 }],
  ai: 'cautious_caster',
}
```

#### 스킬 — `basic_slash` (기본 공격, 비용 없음)
```
{
  id: 'basic_slash', name: '베기',
  pattern: 'single', range: 1, targetSide: 'enemy',
  cost: {},
  casterAnim: 'attack', impactDelay: 200,
  effects: [{ kind: 'damage', mult: 1.0 }],
  fx: { color: 0xffeeaa },
}
```

#### 스킬 — `radiant_slash` (지연 타격 검술)
```
{
  id: 'radiant_slash', name: '광휘검',
  pattern: 'single', range: 2, targetSide: 'enemy',
  cost: { mp: 12 },
  casterAnim: 'cast', impactDelay: 850,    // anim 후반에 검 휘두름
  effects: [{ kind: 'damage', mult: 1.8 }],
  fx: { color: 0xa3c4ff, flash: [200,180,255,140], shake: { duration: 180, intensity: 0.005 } },
}
```

#### 스킬 — `flare` (광역 + 화상 부여)
```
{
  id: 'flare', name: '플레어',
  pattern: 'aoe', range: 6, targetSide: 'enemy',
  cost: { mp: 22 },
  casterAnim: 'cast', impactDelay: 600,
  effects: [
    { kind: 'damage',      mult: 1.6 },
    { kind: 'applyStatus', statusId: 'burn', duration: 3, chance: 0.7 }
  ],
  fx: { color: 0xffb3e8, flash: [220,200,255,180],
        shake: { duration: 260, intensity: 0.008 }, perTargetStagger: 90 },
}
```

#### 도구 — `antidote` (디버프 해제)
```
{
  id: 'antidote', name: '해독초',
  pattern: 'single', range: 1, targetSide: 'ally',
  cost: { uses: 1 },
  casterAnim: 'cast', impactDelay: 200,
  effects: [{ kind: 'removeStatus', filter: { category: 'debuff' } }],
  fx: { color: 0x55ee99 },
}
```

#### 상태 — `burn` (지속 데미지)
```
{
  id: 'burn', category: 'debuff',
  icon: 'fx-burn-icon', color: 0xff7733,
  duration: { ticks: 3, refreshOn: 'apply' },
  stacks:   { max: 1, behavior: 'refresh' },
  tick: { on: 'turn-start',
          effects: [{ kind: 'damage', mult: 0.0, amount: 8 }] },
}
```

#### 상태 — `atk_buff` (공격력 증가)
```
{
  id: 'atk_buff', category: 'buff',
  icon: 'fx-atk-up', color: 0xffe066,
  duration: { ticks: 3 },
  stacks:   { max: 1, behavior: 'replace' },
  modifiers: { atk: '+30%' },
}
```

#### AI 프로필 — `melee_rusher` (표준 패턴)
```
{
  id: 'melee_rusher',
  decide(scene, self, world) {
    const target = world.enemies
      .sort((a,b) => world.manhattan(a,self) - world.manhattan(b,self))[0];
    if (!target) return { kind: 'wait' };

    const dist = world.manhattan(self, target);
    const range = world.getStat(self, 'range');
    if (dist <= range) {
      return { kind: 'attack', targetId: target.id };
    }
    // 사거리 밖 — 한 칸씩 접근
    const dest = pickStepToward(self, target, world);  // helper
    return dest ? { kind: 'move', dest } : { kind: 'defend' };
  }
}
```

#### 시나리오 — `forest_skirmish`
```
{
  participants: [
    { charId: 'melee_swordsman', side: 'ally',  col: 1,  row: 1 },
    { charId: 'ranged_mage',     side: 'ally',  col: 0,  row: 3 },
    { charId: 'skeleton_warrior',side: 'enemy', col: 10, row: 1 },
    { charId: 'skeleton_soldier',side: 'enemy', col: 11, row: 3 },
  ],
  backgrounds: [
    { key: 'bg1', scrollFactor: 0.04 },
    { key: 'bg2', scrollFactor: 0.12 },
    { key: 'bg3', scrollFactor: 0.22 },
    { key: 'bg4', scrollFactor: 0.34 },
    { key: 'bg5', scrollFactor: 0.46 },
    { key: 'bg6', scrollFactor: 0.58 },
  ],
  floor: { texture: 'grass', params: { SUBDIV: 2, VISUAL_PAD: 6 } },
  fleeAllowed: false,
  startCamera: 'enemy',
  introHoldMs: 1600,
}
```

---

## §C 무대 바닥 매핑 — Canvas2D 우회

Phaser 3.80 의 `GameObjects.Mesh` 는 2D 평면 그리드 텍스처 매핑에 안정성이 떨어진다 (`setOrtho` + 평면 정점 + `addVertices` 조합이 렌더링 안 되는 케이스, `GL_REPEAT` wrap 이 파이프라인에 덮어쓰이는 케이스, 마이너 버전마다 `clearVertices`/`clear`/배열직접삭제 중 어느 게 맞는지 다른 점). 평면 텍스처-삼각형 매핑이 필요한 경우 우회 절차:

1. **`textures.createCanvas(key, w, h)`** 로 동적 캔버스 텍스처 생성.
2. **매 프레임 캔버스에 직접 그림**: 각 셀의 사다리꼴을 두 삼각형으로 쪼개 affine 변환으로 텍스처 렌더링.
3. `canvasTex.refresh()` 로 GPU 재업로드.
4. `add.image(x, y, key)` 로 표시.

**텍스처 삼각형 affine 매트릭스** (소스 (s0..s2) → 목적 (d0..d2)):

```
denom = (s0x - s2x)(s1y - s2y) - (s1x - s2x)(s0y - s2y)
m11   = ((d0x - d2x)(s1y - s2y) - (d1x - d2x)(s0y - s2y)) / denom
m12   = ((d0y - d2y)(s1y - s2y) - (d1y - d2y)(s0y - s2y)) / denom
m21   = ((d1x - d2x)(s0x - s2x) - (d0x - d2x)(s1x - s2x)) / denom
m22   = ((d1y - d2y)(s0x - s2x) - (d0y - d2y)(s1x - s2x)) / denom
dx    = d2x - m11·s2x - m21·s2y
dy    = d2y - m12·s2x - m22·s2y

→ ctx.save()
  ctx.beginPath(); moveTo/lineTo 로 목적 삼각형 path
  ctx.clip()
  ctx.transform(m11, m12, m21, m22, dx, dy)
  ctx.drawImage(srcCanvas, 0, 0)
  ctx.restore()
```

성능: 셀 ~수십 × 2 삼각형 = ~수백 drawImage 호출/프레임. 캔버스 refresh 포함해도 60fps 여유.

**셀 경계 seam 처리**: Canvas2D `clip` 의 AA 가 인접 셀 사이에 검은 seam 을 만들 수 있음. 각 셀 사각형을 중심에서 외측으로 1px 미만 확장(`INFL` 값) → seam 가림.

**다른 엔진에서**:
- 평면 메쉬 + UV + 정점셰이더가 정상 동작하면 그쪽이 더 깔끔.
- 텍스처 삼각형 API (WebGL Mesh, SDL 등) 가 있으면 사용.
- 둘 다 없으면 위 Canvas2D 방식이 가장 보편적.
