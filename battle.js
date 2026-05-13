// 맥베스 시스템 풍 그리드 1점 투시 턴제 전투씬 (Phaser 3)
//
// 영감: "제한된 종축 이동과 원근감에 초점을 맞춘 전투 방식. 주인공들이
//        연극 무대 위에서 편 갈라 싸우는 연기를 하고 있는 모습."
//
// 진짜 1점 투시 원근:
//   factor(rowProgress) = D / (D + rowProgress * ROW_DEPTH)
//   screen_x = VIEW_W/2 + (worldX - scrollX - VIEW_W/2) * factor
//   screen_y = HORIZON_Y - GROUND_Y * factor
//
//   → 모든 깊이선이 화면 중앙 horizon 한 점으로 수렴
//   → 카메라가 좌우로 스크롤해도 소실점은 화면 중앙에 고정 (3D 공간감)
//
// 매 프레임 update() 에서 격자/캐릭터 위치를 재투영.

// ── 캔버스/그리드 ─────────────────────────────────
const VIEW_W = 960;
const VIEW_H = 600;
const COLS = 12;
const ROWS = 4;
const COL_W = 150;
const WORLD_W = COLS * COL_W;     // 1800
const ROW_DEPTH = 180;             // 한 row 당 z 증가량
const D = 680;                     // 초점거리(작을수록 원근 강함)
const HORIZON_Y = 200;             // 소실점 Y
const GROUND_Y = -320;             // 카메라가 지면 위 320px (음수)
const SKY_BOTTOM = 340;
const PANEL_Y = 532;
const PANEL_H = VIEW_H - PANEL_Y;

// ── 투영 ───────────────────────────────────────
const perspFactor = (rp) => D / (D + rp * ROW_DEPTH);
const projectY = (rp) => HORIZON_Y - GROUND_Y * perspFactor(rp);
function project(col, rp, scrollX) {
    const worldX = col * COL_W;
    const f = perspFactor(rp);
    const camCenterWorldX = scrollX + VIEW_W / 2;
    return {
        x: VIEW_W / 2 + (worldX - camCenterWorldX) * f,
        y: HORIZON_Y - GROUND_Y * f,
        f,
    };
}
// (col 정수, rp 정수)에서 셀 중심점은 (col+0.5, rp+0.5)
const cellCenterCol = (c) => c + 0.5;
const cellCenterRow = (r) => r + 0.5;

// 스크린 좌표 → 그리드 셀
function screenToCell(sx, sy, scrollX) {
    const dy = sy - HORIZON_Y;
    if (dy <= 0) return null;
    const factor = dy / (-GROUND_Y);
    if (factor > 1 || factor < perspFactor(ROWS)) return null;
    const rp = (D / factor - D) / ROW_DEPTH;
    if (rp < 0 || rp >= ROWS) return null;
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor(rp)));
    const worldX = (sx - VIEW_W / 2) / factor + scrollX + VIEW_W / 2;
    if (worldX < 0 || worldX >= WORLD_W) return null;
    const col = Math.floor(worldX / COL_W);
    return { col, row };
}

// ── 유닛 데이터 (col, row : 0..COLS-1 / 0..ROWS-1) ──
// row 0 = 가장 앞(뷰어 쪽), row 3 = 가장 뒤(소실점 쪽)
// move/range는 맨해튼 거리 기준
const PARTY_TEMPLATE = [
    { id: 'veramode', name: '베라모드',   side: 'ally',  col: 1,  row: 1,
        hp: 140, mp: 50,  atk: 28, def: 14, spd: 12, move: 3, range: 1,
        color: 0x4a6fa5, accent: 0xa3c4ff,
        visual: {
            sheet: 'char2', frame: 0,
            scale: 4,
            anchorX: 146 / 288,
            anchorY: 126 / 128,
            hudY: -200,             // 머리 위로 HUD 올림
            anims: {
                idle:   { key: 'char2-idle' },
                walk:   { key: 'char2-walk' },
                attack: { key: 'char2-attack' },
                cast:   { key: 'char2-cast',   anchorY: 127 / 128 }, // 1px 아래 보정
                dead:   { key: 'char2-dead' },
                hit:    { key: 'char2-hit' },
            },
        },
        skill: { name: '광휘검', dmg: 1.8, mp: 12, range: 2, aoe: false, impactDelay: 850 } },
    { id: 'iolin',    name: '이올린',     side: 'ally',  col: 0,  row: 3,
        hp: 90,  mp: 110, atk: 14, def: 8,  spd: 14, move: 2, range: 5,
        color: 0xc065a8, accent: 0xffb3e8,
        visual: {
            sheet: 'char1', frame: 0,
            scale: 4,                  // 캐릭터 크기 배율
            anchorX: 142 / 288,        // 캐릭터 가로 중심 (프레임 비율)
            anchorY: 126 / 128,        // 캐릭터 발 위치 (프레임 비율)
            hudY: -200,                // 머리 위로 HUD 올림
            anims: {
                idle:   { key: 'char1-idle' },
                walk:   { key: 'char1-walk' },
                attack: { key: 'char1-attack' },
                cast:   { key: 'char1-cast' },
                dead:   { key: 'char1-dead' },
                hit:    { key: 'char1-hit' },
            },
        },
        skill: { name: '플레어', dmg: 1.9, mp: 22, range: 6, aoe: true } },
    // 몬스터들 — 근접 공격만 (스킬 없음)
    { id: 'darkk',    name: '해골 전사',   side: 'enemy', col: 10, row: 1,
        hp: 130, mp: 0,   atk: 26, def: 16, spd: 9,  move: 3, range: 1,
        color: 0x6b4a8a, accent: 0xb89cff,
        visual: {
            sheet: 'monster_idle', frame: 0,
            scale: 3,
            anchorX: 82 / 150,
            anchorY: 100 / 150,
            hudY: -180,             // 해골 머리 위 HUD

            anims: {
                idle:   { key: 'monster-idle' },
                walk:   { key: 'monster-walk' },
                attack: { key: 'monster-attack' },
                dead:   { key: 'monster-dead' },
                hit:    { key: 'monster-hit' },
            },
        } },
    { id: 'sorc',     name: '해골 병사',   side: 'enemy', col: 11, row: 3,
        hp: 80,  mp: 0,   atk: 18, def: 8,  spd: 11, move: 3, range: 1,
        color: 0x8a3a4a, accent: 0xff8a9c,
        visual: {
            sheet: 'monster_idle', frame: 0,
            scale: 3,
            anchorX: 82 / 150,
            anchorY: 100 / 150,
            hudY: -180,             // 해골 머리 위 HUD

            anims: {
                idle:   { key: 'monster-idle' },
                walk:   { key: 'monster-walk' },
                attack: { key: 'monster-attack' },
                dead:   { key: 'monster-dead' },
                hit:    { key: 'monster-hit' },
            },
        } },
];

const manhattan = (a, b) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);

// ── 씬 ───────────────────────────────────────────
class BattleScene extends Phaser.Scene {
    constructor() { super('Battle'); }

    preload() {
        // 패럴랙스 배경 6겹 — 1이 가장 뒤, 6이 가장 앞
        this.load.image('bg1', 'public/1.png');
        this.load.image('bg2', 'public/2.png');
        this.load.image('bg3', 'public/3.png');
        this.load.image('bg4', 'public/4.png');
        this.load.image('bg5', 'public/5.png');
        this.load.image('bg6', 'public/6.png');
        // 바닥 타일셋 (grass.png — 16x16 타일 12x21 그리드, 좌상단 영역이 잔디)
        this.load.image('grass', 'public/grass.png');
        // 캐릭터 스프라이트시트
        // char1: 22열×17행 (이올린)
        this.load.spritesheet('char1', 'public/char1.png', {
            frameWidth: 288,
            frameHeight: 128,
        });
        // char2: 28열×14행 (베라모드)
        this.load.spritesheet('char2', 'public/char2.png', {
            frameWidth: 288,
            frameHeight: 128,
        });
        // 몬스터 (해골) — 각 anim 이 별도 시트, 150×150 프레임
        this.load.spritesheet('monster_idle',   'public/monster_Idle.png',   { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('monster_walk',   'public/monster_walk.png',   { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('monster_attack', 'public/monster_attack.png', { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('monster_death',  'public/monster_death.png',  { frameWidth: 150, frameHeight: 150 });
        this.load.spritesheet('monster_hit',    'public/monster_hit.png',    { frameWidth: 150, frameHeight: 150 });
    }

    create() {
        this.cameras.main.setBounds(0, 0, WORLD_W, VIEW_H);
        this.cameras.main.setScroll(0, 0);

        this.drawParallaxBackground();
        this.setupFloorCanvas();
        this.defineAnimations();

        // 무대 관련 그래픽은 모두 화면-좌표계(scrollFactor 0)로 매 프레임 재투영
        this.floorBaseGfx = this.add.graphics().setScrollFactor(0);
        this.floorGridGfx = this.add.graphics().setScrollFactor(0);
        this.moveHighlightGfx = this.add.graphics().setScrollFactor(0);
        this.attackHighlightGfx = this.add.graphics().setScrollFactor(0);
        this.hoverHighlightGfx = this.add.graphics().setScrollFactor(0);

        // 유닛 + 이펙트 컨테이너 (스크롤 무관, 매 프레임 위치 갱신)
        this.unitLayer = this.add.container(0, 0).setScrollFactor(0);
        this.effectLayer = this.add.container(0, 0).setScrollFactor(0);

        this.units = PARTY_TEMPLATE.map(d => ({
            ...d,
            maxHp: d.hp,
            maxMp: d.mp,
            alive: true,
            defending: false,
            visualCol: d.col,    // 애니메이션용
            visualRow: d.row,
            offsetX: 0,          // 돌진 시 임시 변위(스크린 px)
            offsetY: 0,
        }));
        this.createUnitSprites();
        this.drawHud();

        // 포인터
        this.input.on('pointerdown', (p) => this.onPointer(p));
        this.input.on('pointermove', (p) => this.onPointerMove(p));

        this.round = 0;
        this.uiMode = 'animating';
        this.activeUnit = null;
        this.turnState = null;
        this.pendingTarget = null;
        this.showGrid = false;    // 디버그용 격자 토글
        this.createDebugToggles();
        this.playIntroSequence();
    }

    // 인트로: 적 진영을 먼저 비춰 적을 식별할 시간을 준 뒤,
    // 아군 진영으로 천천히 스크롤하며 첫 라운드 시작.
    playIntroSequence() {
        const enemies = this.units.filter(u => u.side === 'enemy');
        const allies  = this.units.filter(u => u.side === 'ally');
        const enemyAvgX = enemies.reduce((s, e) => s + this.unitWorldX(e), 0) / enemies.length;
        const allyAvgX  = allies.reduce((s, a) => s + this.unitWorldX(a), 0) / allies.length;
        const enemyScrollX = Phaser.Math.Clamp(enemyAvgX - VIEW_W / 2, 0, WORLD_W - VIEW_W);

        this.cameras.main.setScroll(enemyScrollX, 0);
        this.turnText.setText('적 진영 등장');
        this.log('적을 확인하세요...');

        this.time.delayedCall(1600, () => {
            this.log('아군 진영으로 이동...');
            this.panCameraTo(allyAvgX, 1100).then(() => this.nextRound());
        });
    }

    update() {
        const sx = this.cameras.main.scrollX;
        if (this.bgLayers) {
            this.bgLayers.forEach(({ ts, factor, scale }) => {
                // tileScale 보정으로 시각 스크롤 속도를 factor 의도대로 유지
                ts.tilePositionX = sx * factor / (scale || 1);
            });
        }
        this.updateFloorCanvas(sx);
        this.drawFloor(sx);
        this.drawHighlights(sx);
        this.updateUnits(sx);
        this.updateActionButtonPositions(sx);
        if (this.uiMode === 'selectFacing') this.updateFacingArrows(sx);
    }

    // ─── 바닥 텍스처 (Canvas2D 텍스처 삼각형) ──
    // 32×32 타일을 미리 128×128 (4×4) 무봉합 텍스처로 합성한 뒤,
    // 매 프레임 캔버스에 셀별 두 삼각형을 affine 변환으로 그려 Phaser 텍스처로 갱신.
    // 셀 모서리는 모두 project()로 계산 → 격자선과 정확히 같은 1점 투시.
    setupFloorCanvas() {
        const frontY = projectY(0);
        const backY = projectY(ROWS);
        this.floorStageTop = Math.floor(backY) - 2;
        this.floorStageH = Math.ceil(frontY - this.floorStageTop) + 4;

        // 1단계: grass.png 잔디 타일로 8x8 sub-region 그리드 합성 (256x256)
        // 각 sub-region = 32x32 (2x2 native 타일) → 셀당 4 타일 (이전 1 → 적당히 줄임)
        // 잔디 변종 3개 + 꽃 변종 4개 → 64 sub-region 마다 다른 조합으로 셀별 다양성
        const SUB_SIZE = 32;
        const GRID = 8;
        const preSize = SUB_SIZE * GRID; // 256
        const preCanvas = document.createElement('canvas');
        preCanvas.width = preSize;
        preCanvas.height = preSize;
        const preCtx = preCanvas.getContext('2d');
        preCtx.imageSmoothingEnabled = false;
        const grass = this.textures.get('grass').getSourceImage();

        const baseGrass   = [[0, 0], [1, 0], [2, 0]];               // 잔디 변종 3종
        const flowerTiles = [[2, 1], [2, 2], [2, 3], [3, 1]];       // 꽃/장식 변종 4종
        // 64 sub-region 중 꽃이 1슬롯 들어가는 것들 (≈14% 셀에 꽃)
        const flowerSubs = new Set([5, 12, 19, 26, 33, 40, 47, 54, 60]);

        for (let sub = 0; sub < GRID * GRID; sub++) {
            const sxG = sub % GRID;
            const syG = Math.floor(sub / GRID);
            const isFlower = flowerSubs.has(sub);
            const flowerSlot = isFlower ? (sub % 4) : -1;  // 0..3 중 어느 slot 에 꽃
            const flowerT = isFlower ? flowerTiles[sub % flowerTiles.length] : null;

            // 각 sub-region 의 2x2 native 타일 슬롯
            for (let ty = 0; ty < 2; ty++) {
                for (let tx = 0; tx < 2; tx++) {
                    const slot = ty * 2 + tx;
                    const tile = (slot === flowerSlot)
                        ? flowerT
                        : baseGrass[(sub * 7 + slot * 13) % baseGrass.length];
                    const dx = sxG * SUB_SIZE + tx * 16;
                    const dy = syG * SUB_SIZE + ty * 16;
                    preCtx.drawImage(grass, tile[0] * 16, tile[1] * 16, 16, 16,
                        dx, dy, 16, 16);
                }
            }
        }
        this.floorPreTiled = preCanvas;
        this.floorPreSize = SUB_SIZE;   // 셀 sub-region 크기
        this.floorPreGrid = GRID;       // sub-region 그리드 변

        // 2단계: 동적 캔버스 텍스처 (스테이지 영역)
        const KEY = 'floor-canvas';
        if (this.textures.exists(KEY)) this.textures.remove(KEY);
        this.floorCanvasTex = this.textures.createCanvas(KEY, VIEW_W, this.floorStageH);
        this.floorCtx = this.floorCanvasTex.getContext();
        this.floorCtx.imageSmoothingEnabled = false;

        // 3단계: Phaser Image 로 표시
        this.floorImage = this.add.image(0, this.floorStageTop, KEY)
            .setOrigin(0, 0)
            .setScrollFactor(0);

        this.lastFloorScrollX = NaN;
    }

    updateFloorCanvas(scrollX) {
        if (!this.floorCtx) return;
        if (scrollX === this.lastFloorScrollX) return;
        this.lastFloorScrollX = scrollX;

        const ctx = this.floorCtx;
        const src = this.floorPreTiled;
        const sSize = this.floorPreSize;
        const topY = this.floorStageTop;

        ctx.clearRect(0, 0, VIEW_W, this.floorStageH);

        const SUBDIV = 2;       // 한 셀 가로/깊이 2분할
        const VISUAL_PAD = 6;   // 양 끝에 가상 셀을 더 그려 화면 모서리 검정 공백 제거
        const GRID = this.floorPreGrid;
        const TOTAL_SUBS = GRID * GRID;

        for (let r = 0; r < ROWS; r++) {
            for (let c = -VISUAL_PAD; c < COLS + VISUAL_PAD; c++) {
                // 셀마다 preCanvas 의 다른 sub-region 픽업 (deterministic hash)
                const cHash = ((c * 73856093) ^ ((r + 1) * 19349663)) >>> 0;
                const subIdx = cHash % TOTAL_SUBS;
                const uX = (subIdx % GRID) * sSize;
                const uY = Math.floor(subIdx / GRID) * sSize;
                const subStep = sSize / SUBDIV;

                for (let sy = 0; sy < SUBDIV; sy++) {
                    for (let sx = 0; sx < SUBDIV; sx++) {
                        const c0 = c + sx / SUBDIV;
                        const c1 = c + (sx + 1) / SUBDIV;
                        const r0 = r + sy / SUBDIV;
                        const r1 = r + (sy + 1) / SUBDIV;

                        const tl = project(c0, r0, scrollX);
                        const tr = project(c1, r0, scrollX);
                        const br = project(c1, r1, scrollX);
                        const bl = project(c0, r1, scrollX);

                        // 셀 clip path AA 가 만드는 검은 seam 가리기 — 중심에서 외측으로 살짝 확장
                        const ccx = (tl.x + tr.x + br.x + bl.x) * 0.25;
                        const ccy = (tl.y + tr.y + br.y + bl.y) * 0.25;
                        const INFL = 0.6;
                        const pushOut = (p) => {
                            const dx = p.x - ccx, dy = p.y - ccy;
                            const len = Math.hypot(dx, dy);
                            if (len < 0.001) return p;
                            const k = 1 + INFL / len;
                            return { x: ccx + dx * k, y: ccy + dy * k };
                        };
                        const tlE = pushOut(tl), trE = pushOut(tr);
                        const brE = pushOut(br), blE = pushOut(bl);

                        // 캔버스 좌표 (스테이지 top 만큼 빼줌)
                        const tlX = tlE.x, tlY = tlE.y - topY;
                        const trX = trE.x, trY = trE.y - topY;
                        const brX = brE.x, brY = brE.y - topY;
                        const blX = blE.x, blY = blE.y - topY;

                        // 셀의 sub-region 안에서 sub-cell 위치에 해당하는 영역
                        const suX0 = uX + sx * subStep;
                        const suY0 = uY + sy * subStep;
                        const suX1 = uX + (sx + 1) * subStep;
                        const suY1 = uY + (sy + 1) * subStep;

                        // 두 삼각형 (tl,tr,br) (tl,br,bl)
                        this.drawTexturedTri(ctx, src,
                            suX0, suY0, suX1, suY0, suX1, suY1,
                            tlX, tlY, trX, trY, brX, brY);
                        this.drawTexturedTri(ctx, src,
                            suX0, suY0, suX1, suY1, suX0, suY1,
                            tlX, tlY, brX, brY, blX, blY);
                    }
                }
            }
        }

        this.floorCanvasTex.refresh();
    }

    drawTexturedTri(ctx, img,
                    s0x, s0y, s1x, s1y, s2x, s2y,
                    d0x, d0y, d1x, d1y, d2x, d2y) {
        // 소스 삼각형 → 목적 삼각형 affine 변환 계수 계산
        const denom = (s0x - s2x) * (s1y - s2y) - (s1x - s2x) * (s0y - s2y);
        if (denom === 0) return;
        const m11 = ((d0x - d2x) * (s1y - s2y) - (d1x - d2x) * (s0y - s2y)) / denom;
        const m12 = ((d0y - d2y) * (s1y - s2y) - (d1y - d2y) * (s0y - s2y)) / denom;
        const m21 = ((d1x - d2x) * (s0x - s2x) - (d0x - d2x) * (s1x - s2x)) / denom;
        const m22 = ((d1y - d2y) * (s0x - s2x) - (d0y - d2y) * (s1x - s2x)) / denom;
        const dx = d2x - m11 * s2x - m21 * s2y;
        const dy = d2y - m12 * s2x - m22 * s2y;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(d0x, d0y);
        ctx.lineTo(d1x, d1y);
        ctx.lineTo(d2x, d2y);
        ctx.closePath();
        ctx.clip();
        ctx.transform(m11, m12, m21, m22, dx, dy);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
    }

    // ─── 디버그 토글 (우상단) ─────────
    createDebugToggles() {
        const x = VIEW_W - 8, y = 8;
        const bg = this.add.rectangle(x, y, 64, 22, 0x000000, 0.5)
            .setOrigin(1, 0)
            .setStrokeStyle(1, 0x8a6acc)
            .setScrollFactor(0);
        const txt = this.add.text(x - 32, y + 11, 'Grid', {
            fontSize: '11px',
            color: this.showGrid ? '#ffe066' : '#888888',
            stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5).setScrollFactor(0);
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', (pointer, _x, _y, ev) => {
            if (ev) ev.stopPropagation();
            this.showGrid = !this.showGrid;
            txt.setColor(this.showGrid ? '#ffe066' : '#888888');
        });
        this.gridToggleBg = bg;
        this.gridToggleTxt = txt;
    }

    // ─── 콘텐츠 측 애니메이션 정의 ─────────
    defineAnimations() {
        const animsToCreate = [
            // char1 (이올린): 22열, 행 0=idle, 1=walk, 8=dead, 11=attack, 12=cast
            { key: 'char1-idle',   start: 0,   end: 11,  rate: 8,  repeat: -1 },
            { key: 'char1-walk',   start: 22,  end: 31,  rate: 12, repeat: -1 },
            { key: 'char1-attack', start: 242, end: 256, rate: 16, repeat: 0 },
            { key: 'char1-cast',   start: 264, end: 275, rate: 14, repeat: 0 },
            { key: 'char1-dead',   start: 352, end: 370, rate: 10, repeat: 0 }, // row 16
            { key: 'char1-hit',    start: 330, end: 335, rate: 14, repeat: 0 }, // row 15 (1-idx 16)
            // char2 (베라모드): 28열, 행 0=idle, 1=walk, 5=attack, 10=cast, 13=dead
            { key: 'char2-idle',   sheet: 'char2', start: 0,   end: 7,   rate: 8,  repeat: -1 },
            { key: 'char2-walk',   sheet: 'char2', start: 28,  end: 35,  rate: 12, repeat: -1 },
            { key: 'char2-attack', sheet: 'char2', start: 252, end: 259, rate: 14, repeat: 0 }, // row 9
            { key: 'char2-cast',   sheet: 'char2', start: 280, end: 297, rate: 14, repeat: 0 },
            { key: 'char2-dead',   sheet: 'char2', start: 364, end: 376, rate: 10, repeat: 0 },
            { key: 'char2-hit',    sheet: 'char2', start: 336, end: 341, rate: 14, repeat: 0 }, // row 12 (1-idx 13)
            // 몬스터 (해골): 각 anim 별도 시트
            { key: 'monster-idle',   sheet: 'monster_idle',   start: 0, end: 3, rate: 6,  repeat: -1 },
            { key: 'monster-walk',   sheet: 'monster_walk',   start: 0, end: 3, rate: 10, repeat: -1 },
            { key: 'monster-attack', sheet: 'monster_attack', start: 0, end: 7, rate: 14, repeat: 0  },
            { key: 'monster-dead',   sheet: 'monster_death',  start: 0, end: 3, rate: 8,  repeat: 0  },
            { key: 'monster-hit',    sheet: 'monster_hit',    start: 0, end: 3, rate: 12, repeat: 0  },
        ];
        animsToCreate.forEach(a => {
            if (!this.anims.exists(a.key)) {
                this.anims.create({
                    key: a.key,
                    frames: this.anims.generateFrameNumbers(a.sheet || 'char1', { start: a.start, end: a.end }),
                    frameRate: a.rate,
                    repeat: a.repeat,
                });
            }
        });
    }

    // 엔티티가 특정 col 을 향하도록 facing 갱신 (같은 col 이면 변경 없음)
    faceTowardCol(u, targetCol) {
        if (targetCol > u.col) u.facing = 1;
        else if (targetCol < u.col) u.facing = -1;
    }

    // 액션 anim 의 완료를 기다린 후 콜백 호출 (스프라이트 없으면 fallback ms 후 호출).
    // 캐스트/공격 같은 one-shot anim 이 도중에 잘리지 않도록 함.
    waitForActionAnim(u, stateKey, fallbackMs, onDone) {
        if (u.bodySprite && u.visual && u.visual.anims && u.visual.anims[stateKey]) {
            const def = u.visual.anims[stateKey];
            const animKey = (typeof def === 'string') ? def : def.key;
            u.bodySprite.once(`animationcomplete-${animKey}`, onDone);
        } else {
            this.time.delayedCall(fallbackMs, onDone);
        }
    }

    // 엔티티의 상태별 애니메이션 재생 (visual.anims 맵에서 키 조회)
    // 각 anim 의 캐릭터 발 위치(anchorY)가 다르면 sprite.y 로 자동 보정해 발 위치를 일정하게 유지.
    playEntityAnim(u, stateKey) {
        if (!u.bodySprite || !u.visual || !u.visual.anims) return;
        // 죽은 엔티티는 'dead' 외의 anim 으로 절대 풀리지 않음 (마지막 프레임 유지)
        if (u.alive === false && stateKey !== 'dead') return;
        const def = u.visual.anims[stateKey];
        if (!def) return;
        const animKey = (typeof def === 'string') ? def : def.key;
        if (!animKey || !this.anims.exists(animKey)) return;

        // anim 별 anchorY 보정 — sprite origin 은 base anchorY 로 고정, y 오프셋으로 정렬
        const baseAnchorY = u.visual.anchorY ?? 1.0;
        const animAnchorY = (typeof def === 'object' && def.anchorY !== undefined)
            ? def.anchorY : baseAnchorY;
        const frameH = (u.bodySprite.frame && u.bodySprite.frame.height) || 0;
        const scale = u.bodyBaseScale ?? 1;
        const yShift = (baseAnchorY - animAnchorY) * frameH * scale;
        u.bodySprite.y = (u.visual.offsetY ?? 0) + yShift;

        u.bodySprite.play(animKey, true);
    }

    // ─── 패럴랙스 배경 (5겹 TileSprite) ─────────
    drawParallaxBackground() {
        // 1(가장 뒤) → 6(가장 앞). 뒤일수록 느린 스크롤
        const layers = [
            { key: 'bg1', factor: 0.04 },
            { key: 'bg2', factor: 0.12 },
            { key: 'bg3', factor: 0.22 },
            { key: 'bg4', factor: 0.34 },
            { key: 'bg5', factor: 0.46 },
            { key: 'bg6', factor: 0.58 },
        ];
        const layerH = Math.ceil(projectY(ROWS)); // 무대 뒷 가장자리(시각상 가장 위)까지 채움
        const imgH = 176;                          // 원본 이미지 높이
        const SCALE = 2.45;                           // 비율 유지 스케일업 (fit=2.02 보다 큼)
        this.bgLayers = layers.map(({ key, factor }) => {
            const ts = this.add.tileSprite(0, 0, VIEW_W, layerH, key)
                .setOrigin(0, 0)
                .setScrollFactor(0);
            ts.tileScaleX = SCALE;
            ts.tileScaleY = SCALE;
            // 텍스처 아래쪽이 TS 아래쪽(=무대 시작점)에 정렬 → 윗부분(하늘) 화면 밖으로
            ts.tilePositionY = imgH - layerH / SCALE;
            return { ts, factor, scale: SCALE };
        });
    }

    // ─── 무대 바닥 (1점 투시) ─────────────────
    drawFloor(scrollX) {
        const g = this.floorBaseGfx;
        g.clear();

        const frontY = projectY(0);
        const backY = projectY(ROWS);

        // 바닥 베이스는 floorMesh(텍스처)가 담당. 여기선 안개/오버레이만.

        // 깊이 안개 — 뒤로 갈수록 어두워짐(대기 원근)
        g.fillGradientStyle(0x0a0418, 0x0a0418, 0x0a0418, 0x0a0418, 0.65, 0.65, 0, 0);
        g.fillRect(0, backY, VIEW_W, frontY - backY);

        // ── 격자 라인 (디버그 토글) ──────────
        const grid = this.floorGridGfx;
        grid.clear();
        if (this.showGrid) {
            // 가로(행) 선 — 같은 깊이의 점들을 잇는 수평선
            for (let r = 0; r <= ROWS; r++) {
                const a = project(0, r, scrollX);
                const b = project(COLS, r, scrollX);
                const farness = r / ROWS;
                grid.lineStyle(r === 0 || r === ROWS ? 2 : 1, 0xc8a8ff, 0.7 - farness * 0.35);
                grid.lineBetween(a.x, a.y, b.x, b.y);
            }
            // 세로(열) 선 — 소실점으로 수렴
            for (let c = 0; c <= COLS; c++) {
                const front = project(c, 0, scrollX);
                const back = project(c, ROWS, scrollX);
                grid.lineStyle(c === 0 || c === COLS ? 2 : 1, 0xc8a8ff, 0.55);
                grid.lineBetween(front.x, front.y, back.x, back.y);
            }
        }

        // 무대 앞 프로시니엄(가장 가까운 검은 림)
        g.fillStyle(0x000000, 0.7);
        g.fillRect(0, frontY - 2, VIEW_W, 6);
    }

    fillCell(gfx, col, row, color, alpha, scrollX) {
        const fl = project(col,     row,     scrollX);
        const fr = project(col + 1, row,     scrollX);
        const br = project(col + 1, row + 1, scrollX);
        const bl = project(col,     row + 1, scrollX);
        gfx.fillStyle(color, alpha);
        gfx.beginPath();
        gfx.moveTo(fl.x, fl.y);
        gfx.lineTo(fr.x, fr.y);
        gfx.lineTo(br.x, br.y);
        gfx.lineTo(bl.x, bl.y);
        gfx.closePath();
        gfx.fillPath();
    }

    strokeCell(gfx, col, row, color, alpha, scrollX, lineWidth = 2) {
        const fl = project(col,     row,     scrollX);
        const fr = project(col + 1, row,     scrollX);
        const br = project(col + 1, row + 1, scrollX);
        const bl = project(col,     row + 1, scrollX);
        gfx.lineStyle(lineWidth, color, alpha);
        gfx.beginPath();
        gfx.moveTo(fl.x, fl.y);
        gfx.lineTo(fr.x, fr.y);
        gfx.lineTo(br.x, br.y);
        gfx.lineTo(bl.x, bl.y);
        gfx.closePath();
        gfx.strokePath();
    }

    // ─── 하이라이트 ─────────────────────────
    drawHighlights(scrollX) {
        this.moveHighlightGfx.clear();
        this.attackHighlightGfx.clear();
        const inSelectLike = ['selectMove', 'attackMode', 'skillMode'].includes(this.uiMode);
        if (!inSelectLike) this.hoverHighlightGfx.clear();

        if (this.uiMode === 'selectMove') {
            const u = this.activeUnit;
            const reachable = this.getReachableCells(u);
            reachable.forEach(({ col, row }) => {
                this.fillCell(this.moveHighlightGfx, col, row, 0x55ff99, 0.35, scrollX);
                this.strokeCell(this.moveHighlightGfx, col, row, 0x55ff99, 0.9, scrollX, 2);
            });
        }

        const isAttackPhase = ['attackMode', 'skillMode', 'skillAoeMode'].includes(this.uiMode);
        if (isAttackPhase) {
            const u = this.activeUnit;
            const isSkill = this.uiMode !== 'attackMode';
            const range = isSkill ? u.skill.range : u.range;

            // 사거리 전체 — 옅은 색
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (Math.abs(c - u.col) + Math.abs(r - u.row) > range) continue;
                    if (c === u.col && r === u.row) continue;
                    this.fillCell(this.attackHighlightGfx, c, r, 0xff6688, 0.13, scrollX);
                }
            }

            const targets = this.getValidTargets(u, range);

            if (this.uiMode === 'skillAoeMode') {
                // 광역: 영향 받는 모든 대상 강조
                targets.forEach(t => {
                    this.fillCell(this.attackHighlightGfx, t.col, t.row, 0xff5577, 0.5, scrollX);
                    this.strokeCell(this.attackHighlightGfx, t.col, t.row, 0xffee88, 1, scrollX, 4);
                });
            } else if (this.pendingTarget) {
                // 잠긴 대상은 강조, 나머지 가능 대상은 옅게
                targets.forEach(t => {
                    if (t === this.pendingTarget) return;
                    this.strokeCell(this.attackHighlightGfx, t.col, t.row, 0xff5577, 0.4, scrollX, 2);
                });
                this.fillCell(this.attackHighlightGfx, this.pendingTarget.col, this.pendingTarget.row, 0xff5577, 0.5, scrollX);
                this.strokeCell(this.attackHighlightGfx, this.pendingTarget.col, this.pendingTarget.row, 0xffee88, 1, scrollX, 4);
            } else {
                // 아직 대상 미선택 — 가능 대상 표시
                targets.forEach(t => {
                    this.strokeCell(this.attackHighlightGfx, t.col, t.row, 0xff5577, 1, scrollX, 3);
                });
            }
        }
    }

    // ─── 유닛 스프라이트 (스크린 좌표로 매 프레임 갱신) ─
    createUnitSprites() {
        // 유닛은 row 가 클수록(뒤일수록) 먼저 그려져야(뒤에 깔려야) — 정렬용 sortChildrenFlag
        this.units.forEach(u => {
            const c = this.add.container(0, 0);
            this.unitLayer.add(c);

            let body = null;
            if (u.visual && u.visual.sheet) {
                // 스프라이트 엔티티는 비주얼이 자체 그림자/실루엣을 포함하므로 별도 그림자 생략
                // 콘텐츠 정의 스프라이트
                // anchorX/Y: 프레임 내 캐릭터 발 위치 (0..1 비율). 기본 (0.5, 1.0) = 중앙-바닥.
                const ax = u.visual.anchorX ?? 0.5;
                const ay = u.visual.anchorY ?? 1.0;
                const baseScale = u.visual.scale ?? 1;
                // 발 위치를 컨테이너 원점(셀 세로 중심)에 둠 → 격자선과 안 겹침
                const offsetY = u.visual.offsetY ?? 0;
                const spr = this.add.sprite(0, offsetY, u.visual.sheet, u.visual.frame ?? 0);
                spr.setOrigin(ax, ay);
                spr.setScale(baseScale);
                c.add(spr);
                body = spr;
                u.bodySprite = spr;
                u.bodyBaseScale = baseScale;
                // 초기 idle 재생 (helper 통해 anchorY 보정 함께 적용)
                this.playEntityAnim(u, 'idle');
            } else {
                // 기본 도형 합성 (콘텐츠 미정의 시 폴백) — 그림자 포함
                const shadow = this.add.ellipse(0, 26, 60, 14, 0x000000, 0.55);
                c.add(shadow);

                body = this.add.graphics();
                body.fillStyle(u.color, 1);
                body.lineStyle(2, u.accent, 1);
                body.fillRoundedRect(-20, -22, 40, 52, 6);
                body.strokeRoundedRect(-20, -22, 40, 52, 6);
                c.add(body);

                const head = this.add.circle(0, -32, 14, u.accent, 1);
                head.setStrokeStyle(2, 0xffffff);
                c.add(head);

                const weapon = this.add.rectangle(u.side === 'ally' ? 22 : -22, -10, 4, 38, 0xddddee);
                c.add(weapon);
            }

            // HUD 위치: 캐릭터 머리 위 — visual.hudY 로 콘텐츠가 지정, 미지정 시 -58
            const hudY = (u.visual && u.visual.hudY !== undefined) ? u.visual.hudY : -58;

            const label = this.add.text(0, hudY, u.name, {
                fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
                stroke: '#000', strokeThickness: 3,
            }).setOrigin(0.5);
            c.add(label);

            const hpBg = this.add.rectangle(0, hudY + 13, 50, 5, 0x000000).setStrokeStyle(1, 0x999999);
            const hp   = this.add.rectangle(-25, hudY + 13, 50, 5, u.side === 'ally' ? 0x55ee99 : 0xff5577).setOrigin(0, 0.5);
            c.add(hpBg);
            c.add(hp);

            const indicator = this.add.triangle(0, hudY - 20, 0, 0, 14, 0, 7, 12, 0xffee44).setVisible(false);
            c.add(indicator);
            u.indicatorBaseY = hudY - 20;

            u.sprite = c;
            u.spriteBody = body;
            u.spriteIndicator = indicator;
            u.hpBar = hp;
            u.label = label;
            // 좌우 방향 (적은 좌측을 향함)
            u.facing = u.side === 'ally' ? 1 : -1;
        });
    }

    updateUnits(scrollX) {
        // 깊이순(뒤쪽이 먼저 → 앞쪽이 위에)으로 z-order 재정렬
        const sorted = [...this.units].sort((a, b) => b.visualRow - a.visualRow);
        sorted.forEach(u => this.unitLayer.bringToTop(u.sprite));

        this.units.forEach(u => {
            const cc = cellCenterCol(u.visualCol);
            // 셀 중심(0.5) 대신 약간 뒷쪽(0.7) — 큰 스프라이트 발이 셀 앞 모서리에 안 닿도록
            const rc = u.visualRow + 0.7;
            const p = project(cc, rc, scrollX);
            u.sprite.x = p.x + u.offsetX;
            u.sprite.y = p.y + u.offsetY;
            u.sprite.setScale(u.facing * p.f, p.f);
            // 라벨/인디케이터는 정방향 유지 (text/asymmetric 도형)
            u.label.setScale(u.facing, 1);
            u.spriteIndicator.setScale(u.facing, 1);
            // HP 바는 대칭 직사각형이라 보정 없이 container flip 만 따름 (좌우 자연스럽게 미러)
        });
    }

    // ─── HUD ─────────────────────────────────
    drawHud() {
        this.turnText = this.add.text(VIEW_W / 2, 8, '', {
            fontSize: '16px', color: '#ffe066', fontStyle: 'bold',
            stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5, 0).setScrollFactor(0);

        this.logText = this.add.text(VIEW_W / 2, 32, '', {
            fontSize: '14px', color: '#ffffff',
            stroke: '#000', strokeThickness: 3, align: 'center',
        }).setOrigin(0.5, 0).setScrollFactor(0);

        const panel = this.add.graphics().setScrollFactor(0);
        panel.fillStyle(0x000000, 0.86);
        panel.fillRect(0, PANEL_Y, VIEW_W, PANEL_H);
        panel.lineStyle(2, 0x8a6acc, 1);
        panel.strokeRect(0, PANEL_Y, VIEW_W, PANEL_H);

        // 아군 스테이터스
        this.statusTexts = {};
        this.units.filter(u => u.side === 'ally').forEach((u, i) => {
            const baseY = PANEL_Y + 6 + i * 30;
            const nameT = this.add.text(10, baseY, u.name, { fontSize: '13px', color: '#fff', fontStyle: 'bold' }).setScrollFactor(0);
            const statT = this.add.text(96, baseY, '', { fontSize: '11px', color: '#fff' }).setScrollFactor(0);
            const posT  = this.add.text(96, baseY + 14, '', { fontSize: '10px', color: '#aac' }).setScrollFactor(0);
            this.statusTexts[u.id] = { name: nameT, stat: statT, pos: posT };
        });

        // 떠 있는 라디얼 액션 메뉴 — 활성 아군 주위에 표시.
        // (dx, dy) 는 캐릭터 발 위치 기준 스크린 px 오프셋.
        this.actionButtons = [];
        const floatingActions = [
            { key: 'move',    label: '이동',  dx: -110, dy:  -95 },   // 좌상
            { key: 'attack',  label: '공격',  dx:    0, dy: -120 },   // 정상
            { key: 'skill',   label: '스킬',  dx:  110, dy:  -95 },   // 우상
            { key: 'defend',  label: '방어',  dx: -110, dy:   35 },   // 좌하
            { key: 'wait',    label: '대기',  dx:    0, dy:   60 },   // 정하
            { key: 'cancel',  label: '취소',  dx:  110, dy:   35 },   // 우하
        ];
        floatingActions.forEach(a => {
            const bg = this.add.rectangle(0, 0, 72, 26, 0x2a1648, 0.92)
                .setOrigin(0.5, 0.5)
                .setStrokeStyle(2, 0x8a6acc)
                .setScrollFactor(0)
                .setVisible(false);
            const txt = this.add.text(0, 0, a.label, {
                fontSize: '13px', color: '#fff', fontStyle: 'bold',
                stroke: '#000', strokeThickness: 2,
            }).setOrigin(0.5).setScrollFactor(0).setVisible(false);
            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerover', () => { if (bg.input && bg.input.enabled) bg.setFillStyle(0x4a2868, 0.95); });
            bg.on('pointerout',  () => { if (bg.input && bg.input.enabled) bg.setFillStyle(0x2a1648, 0.92); });
            bg.on('pointerdown', (pointer, _x, _y, ev) => { if (ev) ev.stopPropagation(); this.onActionButton(a.key); });
            this.actionButtons.push({ bg, txt, key: a.key, dx: a.dx, dy: a.dy });
        });

        this.refreshHud();
    }

    // 떠 있는 액션 버튼을 매 프레임 활성 유닛 위치로 이동.
    // 화면 경계 / 하단 패널 침범 방지 클램프.
    updateActionButtonPositions(scrollX) {
        if (!this.actionButtons || !this.activeUnit) return;
        const u = this.activeUnit;
        const p = project(cellCenterCol(u.col), u.row + 0.7, scrollX);
        this.actionButtons.forEach(b => {
            if (!b.bg.visible) return;
            const x = Phaser.Math.Clamp(p.x + b.dx, 44, VIEW_W - 44);
            const y = Phaser.Math.Clamp(p.y + b.dy, 56, PANEL_Y - 16);
            b.bg.x = x;
            b.bg.y = y;
            b.txt.x = x;
            b.txt.y = y;
        });
    }

    refreshHud() {
        this.units.forEach(u => {
            const ratio = Math.max(0, u.hp / u.maxHp);
            u.hpBar.width = 50 * ratio;
            if (!u.alive) u.hpBar.setVisible(false);
        });
        this.units.filter(u => u.side === 'ally').forEach(u => {
            const st = this.statusTexts[u.id];
            if (!st) return;
            const hp = `HP ${Math.max(0,u.hp)}/${u.maxHp}`;
            const mp = `MP ${Math.max(0,u.mp)}/${u.maxMp}`;
            st.stat.setText(`${hp}  ${mp}`);
            st.pos.setText(`(${u.col},${u.row})  Move:${u.move} Range:${u.range}`);
            if (!u.alive) { st.name.setColor('#666'); st.stat.setColor('#666'); st.pos.setColor('#444'); }
        });
    }

    setButton(key, enabled, label) {
        const b = this.actionButtons.find(x => x.key === key);
        if (!b) return;
        if (label) b.txt.setText(label);
        b.bg.setVisible(enabled);
        b.txt.setVisible(enabled);
        if (enabled) {
            b.bg.setFillStyle(0x2a1648, 0.92);
            b.bg.setInteractive({ useHandCursor: true });
            if (b.bg.input) b.bg.input.enabled = true;
        } else {
            b.bg.disableInteractive();
        }
    }

    updateActionMenu() {
        const u = this.activeUnit;
        if (!u || u.side !== 'ally' || this.uiMode === 'animating' || this.uiMode === 'selectFacing') {
            this.actionButtons.forEach(b => this.setButton(b.key, false));
            return;
        }

        // 공격/스킬 모드: [공격(또는 스킬)][취소]만 노출
        if (this.uiMode === 'attackMode') {
            this.setButton('move',   false, '이동');
            this.setButton('attack', !!this.pendingTarget, '공격');
            this.setButton('skill',  false, '스킬');
            this.setButton('defend', false);
            this.setButton('wait',   false, '대기');
            this.setButton('cancel', true);
            return;
        }
        if (this.uiMode === 'skillMode') {
            this.setButton('move',   false, '이동');
            this.setButton('attack', false, '공격');
            this.setButton('skill',  !!this.pendingTarget, '스킬');
            this.setButton('defend', false);
            this.setButton('wait',   false, '대기');
            this.setButton('cancel', true);
            return;
        }
        if (this.uiMode === 'skillAoeMode') {
            this.setButton('move',   false, '이동');
            this.setButton('attack', false, '공격');
            this.setButton('skill',  true, '스킬');
            this.setButton('defend', false);
            this.setButton('wait',   false, '대기');
            this.setButton('cancel', true);
            return;
        }

        // 일반(idle) / 이동선택 — 행동 메인 메뉴
        const inAtk   = this.getValidTargets(u, u.range).length > 0;
        const inSkill = this.getValidTargets(u, u.skill.range).length > 0;
        const canMove = !this.turnState.moved && this.getReachableCells(u).length > 0;
        const inSelect = this.uiMode === 'selectMove';

        this.setButton('move',   canMove, '이동');
        this.setButton('attack', !this.turnState.acted && inAtk, '공격');
        this.setButton('skill',  !this.turnState.acted && u.mp >= u.skill.mp && inSkill, '스킬');
        this.setButton('defend', !this.turnState.acted);
        this.setButton('wait',   true, this.turnState.acted ? '턴 종료' : '대기');
        this.setButton('cancel', inSelect);
    }

    log(msg) { this.logText.setText(msg); }

    // ─── 카메라 ───────────────────────────────
    panCameraTo(targetWorldX, duration = 500) {
        const targetScrollX = Phaser.Math.Clamp(targetWorldX - VIEW_W / 2, 0, WORLD_W - VIEW_W);
        return new Promise(resolve => {
            this.tweens.add({
                targets: this.cameras.main,
                scrollX: targetScrollX,
                duration, ease: 'Sine.easeInOut',
                onComplete: resolve,
            });
        });
    }

    unitWorldX(u) { return cellCenterCol(u.col) * COL_W; }

    // ─── facing 선택 (◀/▶ 화살표) ─────────────
    enterFacingSelect(onConfirm) {
        const u = this.activeUnit;
        if (!u) { onConfirm && onConfirm(); return; }

        // AI 유닛은 화살표 없이 가장 가까운 상대 쪽으로 자동 facing
        if (u.side !== 'ally') {
            const foes = this.units.filter(t => t.alive && t.side !== u.side);
            if (foes.length) {
                foes.sort((a, b) => manhattan(a, u) - manhattan(b, u));
                this.faceTowardCol(u, foes[0].col);
            }
            if (onConfirm) onConfirm();
            return;
        }

        this.uiMode = 'selectFacing';
        this.facingOnConfirm = onConfirm || null;
        this.updateActionMenu();
        this.log('방향을 선택하세요. (◀ 좌 / ▶ 우)');
        this.showFacingArrows();
    }

    showFacingArrows() {
        this.hideFacingArrows();
        const u = this.activeUnit;
        if (!u) return;

        const makeArrow = (txt, dir) => {
            const a = this.add.text(0, 0, txt, {
                fontSize: '40px',
                color: '#ffee44',
                stroke: '#000',
                strokeThickness: 5,
                fontStyle: 'bold',
            }).setOrigin(0.5).setScrollFactor(0);
            a.setInteractive({ useHandCursor: true });
            a.on('pointerover', () => a.setColor('#ffffff'));
            a.on('pointerout',  () => a.setColor('#ffee44'));
            a.on('pointerdown', (pointer, _x, _y, ev) => {
                if (ev) ev.stopPropagation();
                this.confirmFacing(dir);
            });
            this.tweens.add({
                targets: a, scale: 1.18,
                duration: 480, yoyo: true, repeat: -1,
                ease: 'Sine.easeInOut',
            });
            return a;
        };

        this.facingArrows = [
            makeArrow('◀', -1),
            makeArrow('▶',  1),
        ];
        this.updateFacingArrows(this.cameras.main.scrollX);
    }

    updateFacingArrows(scrollX) {
        if (!this.facingArrows || !this.facingArrows.length || !this.activeUnit) return;
        const u = this.activeUnit;
        const p = project(cellCenterCol(u.col), u.row + 0.7, scrollX);
        const off = 70;
        const ay = p.y - 80;
        this.facingArrows[0].x = p.x - off;
        this.facingArrows[0].y = ay;
        this.facingArrows[1].x = p.x + off;
        this.facingArrows[1].y = ay;
    }

    hideFacingArrows() {
        if (this.facingArrows) {
            this.facingArrows.forEach(a => { this.tweens.killTweensOf(a); a.destroy(); });
        }
        this.facingArrows = [];
    }

    confirmFacing(dir) {
        const u = this.activeUnit;
        if (u) u.facing = dir;
        this.hideFacingArrows();
        const cb = this.facingOnConfirm;
        this.facingOnConfirm = null;
        if (cb) cb();
    }

    // ─── 턴 흐름 ───────────────────────────────
    nextRound() {
        this.round += 1;
        this.units.forEach(u => u.defending = false);
        this.turnQueue = this.units
            .filter(u => u.alive)
            .slice()
            .sort((a, b) => b.spd - a.spd);
        this.processNextTurn();
    }

    processNextTurn() {
        const allyAlive  = this.units.some(u => u.side === 'ally'  && u.alive);
        const enemyAlive = this.units.some(u => u.side === 'enemy' && u.alive);
        if (!allyAlive || !enemyAlive) return this.endBattle(allyAlive);

        while (this.turnQueue.length && !this.turnQueue[0].alive) this.turnQueue.shift();
        if (this.turnQueue.length === 0) return this.nextRound();

        this.activeUnit = this.turnQueue.shift();
        this.turnState = { moved: false, acted: false };
        this.pendingTarget = null;
        this.uiMode = 'animating';

        this.units.forEach(u => u.spriteIndicator.setVisible(false));
        this.activeUnit.spriteIndicator.setVisible(true);
        this.tweens.killTweensOf(this.activeUnit.spriteIndicator);
        const indBaseY = this.activeUnit.indicatorBaseY ?? -78;
        this.activeUnit.spriteIndicator.y = indBaseY;
        this.tweens.add({
            targets: this.activeUnit.spriteIndicator,
            y: indBaseY - 8, duration: 400, yoyo: true, repeat: -1,
        });

        this.turnText.setText(`Round ${this.round}   ▶   ${this.activeUnit.name}의 턴`);
        this.panCameraTo(this.unitWorldX(this.activeUnit)).then(() => {
            if (this.activeUnit.side === 'ally') {
                this.uiMode = 'idle';
                this.updateActionMenu();
                this.log('행동을 선택하세요.');
            } else {
                this.runEnemyAI();
            }
        });
    }

    endTurn() {
        this.uiMode = 'animating';
        this.updateActionMenu();
        this.time.delayedCall(300, () => this.processNextTurn());
    }

    // ─── 행동 버튼 ─────────────────────────
    onActionButton(key) {
        if (!this.activeUnit || this.activeUnit.side !== 'ally') return;
        if (this.uiMode === 'animating') return;

        if (key === 'cancel') {
            this.pendingTarget = null;
            this.uiMode = 'idle';
            this.updateActionMenu();
            this.log('행동을 선택하세요.');
            return;
        }
        if (key === 'attack') {
            if (this.uiMode === 'attackMode') {
                if (!this.pendingTarget) return;
                return this.executeAttack(this.pendingTarget);
            }
            return this.enterAttackMode('attack');
        }
        if (key === 'skill') {
            if (this.uiMode === 'skillMode') {
                if (!this.pendingTarget) return;
                return this.executeSkillSingle(this.pendingTarget);
            }
            if (this.uiMode === 'skillAoeMode') {
                return this.executeSkillAoe();
            }
            return this.enterAttackMode('skill');
        }
        if (key === 'move')   return this.enterMoveMode();
        if (key === 'defend') return this.doDefend();
        if (key === 'wait')   return this.doWait();
    }

    // ─── 이동 ───────────────────────────────
    enterMoveMode() {
        if (this.turnState.moved) return;
        this.uiMode = 'selectMove';
        this.log('이동할 칸을 선택하세요. (취소 가능)');
        this.updateActionMenu();
    }

    getReachableCells(u) {
        const list = [];
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (c === u.col && r === u.row) continue;
                const d = Math.abs(c - u.col) + Math.abs(r - u.row);
                if (d > u.move) continue;
                if (this.isOccupied(c, r, u)) continue;
                list.push({ col: c, row: r });
            }
        }
        return list;
    }

    isOccupied(col, row, exclude = null) {
        return this.units.some(u => u !== exclude && u.alive && u.col === col && u.row === row);
    }

    executeMove(col, row) {
        const u = this.activeUnit;
        const d = Math.abs(col - u.col) + Math.abs(row - u.row);
        if (d > u.move || d === 0) return;
        if (this.isOccupied(col, row, u)) return;

        this.uiMode = 'animating';
        this.log(`${u.name} → (${col}, ${row}) 이동.`);
        this.updateActionMenu();

        // 시각 좌표를 직접 트윈 (update()에서 매 프레임 재투영)
        this.faceTowardCol(u, col);
        this.panCameraTo(col * COL_W + COL_W / 2, 600);
        this.playEntityAnim(u, 'walk');
        this.tweens.add({
            targets: u,
            visualCol: col,
            visualRow: row,
            duration: 600,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                u.col = col;
                u.row = row;
                this.turnState.moved = true;
                this.refreshHud();
                this.playEntityAnim(u, 'idle');
                this.uiMode = 'idle';
                this.updateActionMenu();
                this.log('다음 행동을 선택하세요.');
            },
        });
    }

    // ─── 공격/스킬 ─────────────────────────
    enterAttackMode(type) {
        if (this.turnState.acted) return;
        const u = this.activeUnit;
        const range = type === 'attack' ? u.range : u.skill.range;
        const targets = this.getValidTargets(u, range);
        if (!targets.length) return this.log('사거리 내에 대상이 없습니다.');

        this.pendingTarget = null;

        if (type === 'skill' && u.skill.aoe) {
            this.uiMode = 'skillAoeMode';
            this.log(`"${u.skill.name}" 광역 — ${targets.length}명에게 발동. "스킬"을 한 번 더 누르세요.`);
            this.updateActionMenu();
            return;
        }

        this.uiMode = type === 'attack' ? 'attackMode' : 'skillMode';
        this.log(type === 'attack'
            ? '공격할 대상을 클릭하세요.'
            : `"${u.skill.name}" 대상을 클릭하세요.`);
        this.updateActionMenu();
    }

    getValidTargets(u, range) {
        return this.units.filter(t =>
            t.alive && t.side !== u.side && manhattan(t, u) <= range
        );
    }

    // ─── 포인터 입력 ─────────────────────────
    findUnitAtScreen(sx, sy) {
        // 앞쪽(visualRow 낮은) 유닛을 먼저 검사
        const sorted = [...this.units].filter(u => u.alive)
            .sort((a, b) => a.visualRow - b.visualRow);
        for (const u of sorted) {
            const bx = u.sprite.x, by = u.sprite.y;
            const halfW = 26 * Math.abs(u.sprite.scaleX);
            const halfH = 56 * Math.abs(u.sprite.scaleY);
            if (sx >= bx - halfW && sx <= bx + halfW
                && sy >= by - halfH && sy <= by + halfH * 0.7) {
                return u;
            }
        }
        return null;
    }

    onPointer(pointer) {
        if (['idle', 'animating', 'skillAoeMode', 'selectFacing'].includes(this.uiMode)) return;
        const sx = pointer.x, sy = pointer.y;
        if (sy >= PANEL_Y) return;
        const scrollX = this.cameras.main.scrollX;

        // 공격/스킬 모드: 대상 클릭하면 잠그기 (아직 발동 X)
        if (this.uiMode === 'attackMode' || this.uiMode === 'skillMode') {
            const u = this.activeUnit;
            const range = this.uiMode === 'attackMode' ? u.range : u.skill.range;
            let target = this.findUnitAtScreen(sx, sy);
            if (!target) {
                const hit = screenToCell(sx, sy, scrollX);
                if (hit) target = this.units.find(t => t.alive && t.col === hit.col && t.row === hit.row);
            }
            if (!target || target.side === u.side || manhattan(target, u) > range) return;
            this.pendingTarget = target;
            this.log(this.uiMode === 'attackMode'
                ? `${target.name} 선택. "공격"을 한 번 더 누르면 발동.`
                : `${target.name} 선택. "스킬"을 한 번 더 누르면 발동.`);
            this.updateActionMenu();
            return;
        }

        if (this.uiMode === 'selectMove') {
            const hit = screenToCell(sx, sy, scrollX);
            if (!hit) return;
            const reach = this.getReachableCells(this.activeUnit);
            if (!reach.find(c => c.col === hit.col && c.row === hit.row)) return;
            this.executeMove(hit.col, hit.row);
        }
    }

    onPointerMove(pointer) {
        this.hoverHighlightGfx.clear();
        if (['idle', 'animating', 'skillAoeMode', 'selectFacing'].includes(this.uiMode)) return;
        const sx = pointer.x, sy = pointer.y;
        if (sy >= PANEL_Y) return;
        const scrollX = this.cameras.main.scrollX;

        if (this.uiMode === 'attackMode' || this.uiMode === 'skillMode') {
            const u = this.activeUnit;
            const range = this.uiMode === 'attackMode' ? u.range : u.skill.range;
            let target = this.findUnitAtScreen(sx, sy);
            if (!target) {
                const hit = screenToCell(sx, sy, scrollX);
                if (hit) target = this.units.find(t => t.alive && t.col === hit.col && t.row === hit.row);
            }
            if (target && target.side !== u.side && manhattan(target, u) <= range) {
                this.strokeCell(this.hoverHighlightGfx, target.col, target.row, 0xffffff, 0.9, scrollX, 3);
            }
            return;
        }

        if (this.uiMode === 'selectMove') {
            const hit = screenToCell(sx, sy, scrollX);
            if (!hit) return;
            const ok = this.getReachableCells(this.activeUnit)
                .some(c => c.col === hit.col && c.row === hit.row);
            if (ok) this.strokeCell(this.hoverHighlightGfx, hit.col, hit.row, 0xffffff, 0.9, scrollX, 3);
        }
    }

    // ─── 공격 실행 ─────────────────────────
    executeAttack(target) {
        const u = this.activeUnit;
        this.uiMode = 'animating';
        this.updateActionMenu();
        this.log(`${u.name}의 공격!`);

        // 카메라: 양쪽 중간으로
        this.faceTowardCol(u, target.col);
        this.panCameraTo((this.unitWorldX(u) + this.unitWorldX(target)) / 2, 350);
        this.playEntityAnim(u, 'attack');

        const finishAttack = () => {
            const tp = project(cellCenterCol(target.col), cellCenterRow(target.row), this.cameras.main.scrollX);
            this.hitEffect(tp.x, tp.y - 20, tp.f);
            const dmg = this.computeDamage(u.atk, target, 1.0);
            this.applyDamage(target, dmg);
        };

        const endAttack = () => {
            this.playEntityAnim(u, 'idle');
            this.turnState.acted = true;
            this.endTurn();
        };

        if (u.range === 1) {
            // 근접: dash 와 attack anim 두 트랙이 모두 끝나면 endAttack
            let dashDone = false;
            let animDone = !u.bodySprite; // sprite 없으면 anim 트랙 즉시 완료 처리
            const tryEnd = () => { if (dashDone && animDone) endAttack(); };
            if (u.bodySprite) {
                this.waitForActionAnim(u, 'attack', 1500,
                    () => { animDone = true; tryEnd(); });
            }
            const dirCol = target.col > u.col ? -1 : target.col < u.col ? 1 : 0;
            const dirRow = target.row > u.row ? -1 : target.row < u.row ? 1 : 0;
            const dashCol = target.col + dirCol * 0.4;
            const dashRow = target.row + dirRow * 0.4;
            const homeCol = u.col, homeRow = u.row;
            this.tweens.add({
                targets: u,
                visualCol: dashCol, visualRow: dashRow,
                duration: 280, ease: 'Cubic.easeIn',
                onComplete: () => {
                    finishAttack();
                    this.tweens.add({
                        targets: u,
                        visualCol: homeCol, visualRow: homeRow,
                        duration: 360, ease: 'Cubic.easeOut',
                        onComplete: () => { dashDone = true; tryEnd(); },
                    });
                },
            });
        } else {
            // 원거리: 제자리 발사 — anim 중간에 임팩트, 완료 후 종료
            this.time.delayedCall(450, finishAttack);
            this.waitForActionAnim(u, 'attack', 800, endAttack);
        }
    }

    executeSkillSingle(target) {
        const u = this.activeUnit;
        this.uiMode = 'animating';
        u.mp -= u.skill.mp;
        this.refreshHud();
        this.updateActionMenu();
        this.log(`${u.name} ▶ "${u.skill.name}"!`);

        this.faceTowardCol(u, target.col);
        this.panCameraTo((this.unitWorldX(u) + this.unitWorldX(target)) / 2, 350);
        this.playEntityAnim(u, 'cast');

        // 캐스팅 모션 (시각 단서) — 임팩트 타이밍과 별도
        this.tweens.add({
            targets: u, offsetY: -14,
            duration: 220, yoyo: true,
        });

        // 임팩트: 스킬별 impactDelay 로 anim 의 실제 타격 프레임과 동기. 미지정 시 440ms (yoyo 정점).
        const impactDelay = u.skill.impactDelay ?? 440;
        this.time.delayedCall(impactDelay, () => {
            this.cameras.main.flash(140, 200, 180, 255);
            this.cameras.main.shake(180, 0.005);
            const tp = project(cellCenterCol(target.col), cellCenterRow(target.row), this.cameras.main.scrollX);
            this.spellEffect(tp.x, tp.y - 20, u.accent, tp.f);
            const dmg = this.computeDamage(u.atk, target, u.skill.dmg);
            this.applyDamage(target, dmg);
        });

        // cast 애니메이션 완료(또는 폴백 지연) 후 idle 복귀 + 턴 종료
        this.waitForActionAnim(u, 'cast', 900, () => {
            this.playEntityAnim(u, 'idle');
            this.turnState.acted = true;
            this.endTurn();
        });
    }

    executeSkillAoe() {
        const u = this.activeUnit;
        this.uiMode = 'animating';
        u.mp -= u.skill.mp;
        this.refreshHud();
        this.updateActionMenu();
        this.log(`${u.name} ▶ "${u.skill.name}"! (광역)`);

        const targets = this.getValidTargets(u, u.skill.range);
        const avgWorldX = targets.reduce((s, t) => s + this.unitWorldX(t), 0) / targets.length;
        this.panCameraTo((this.unitWorldX(u) + avgWorldX) / 2, 350);

        this.playEntityAnim(u, 'cast');
        this.tweens.add({
            targets: u, offsetY: -14,
            duration: 220, yoyo: true,
            onComplete: () => {
                this.cameras.main.flash(180, 220, 200, 255);
                this.cameras.main.shake(260, 0.008);
                targets.forEach((t, i) => {
                    this.time.delayedCall(i * 90, () => {
                        const tp = project(cellCenterCol(t.col), cellCenterRow(t.row), this.cameras.main.scrollX);
                        this.spellEffect(tp.x, tp.y - 20, u.accent, tp.f);
                        const dmg = this.computeDamage(u.atk, t, u.skill.dmg);
                        this.applyDamage(t, dmg);
                    });
                });
            },
        });

        // cast 애니메이션 완료(또는 폴백 지연) 후 idle 복귀 + 턴 종료
        const fallbackMs = Math.max(900, targets.length * 90 + 500);
        this.waitForActionAnim(u, 'cast', fallbackMs, () => {
            this.playEntityAnim(u, 'idle');
            this.turnState.acted = true;
            this.endTurn();
        });
    }

    doDefend() {
        const u = this.activeUnit;
        u.defending = true;
        this.log(`${u.name}이(가) 방어 자세!`);
        this.turnState.acted = true;
        this.uiMode = 'animating';      // 중복 클릭 방지
        this.updateActionMenu();
        this.enterFacingSelect(() => this.time.delayedCall(300, () => this.endTurn()));
    }

    doWait() {
        const u = this.activeUnit;
        u.mp = Math.min(u.maxMp, u.mp + 8);
        this.log(`${u.name}이(가) 호흡을 가다듬는다. (MP +8)`);
        this.refreshHud();
        this.turnState.acted = true;
        this.uiMode = 'animating';      // 중복 클릭 방지
        this.updateActionMenu();
        this.enterFacingSelect(() => this.time.delayedCall(300, () => this.endTurn()));
    }

    // ─── 적 AI ─────────────────────────────
    runEnemyAI() {
        const u = this.activeUnit;
        const enemies = this.units.filter(t => t.alive && t.side !== u.side);
        if (!enemies.length) return this.endTurn();

        enemies.sort((a, b) => manhattan(a, u) - manhattan(b, u));
        const closest = enemies[0];

        const tryAttackOrSkill = () => {
            const inAtk = this.getValidTargets(u, u.range);
            const hasSkill = !!u.skill;
            const inSkill = hasSkill ? this.getValidTargets(u, u.skill.range) : [];
            const canSkill = hasSkill && u.mp >= u.skill.mp && inSkill.length > 0;
            const canAttack = inAtk.length > 0;
            if (canSkill && (Math.random() < 0.55 || !canAttack)) {
                if (u.skill.aoe) return this.executeSkillAoe();
                return this.executeSkillSingle(Phaser.Utils.Array.GetRandom(inSkill));
            }
            if (canAttack) return this.executeAttack(Phaser.Utils.Array.GetRandom(inAtk));
            return this.doDefend();
        };

        const skillReach = (u.skill && u.mp >= u.skill.mp) ? u.skill.range : 0;
        if (manhattan(closest, u) <= Math.max(u.range, skillReach)) {
            return this.time.delayedCall(500, tryAttackOrSkill);
        }

        // 전진: 가장 가까운 적까지 맨해튼 거리를 가장 많이 줄이는 한 칸씩 u.move 만큼
        let cur = { col: u.col, row: u.row };
        const moveSteps = [];
        for (let i = 0; i < u.move; i++) {
            const candidates = [
                { col: cur.col + 1, row: cur.row },
                { col: cur.col - 1, row: cur.row },
                { col: cur.col, row: cur.row + 1 },
                { col: cur.col, row: cur.row - 1 },
            ].filter(p => p.col >= 0 && p.col < COLS && p.row >= 0 && p.row < ROWS
                && !this.isOccupied(p.col, p.row, u));
            if (!candidates.length) break;
            candidates.sort((a, b) => manhattan(a, closest) - manhattan(b, closest));
            cur = candidates[0];
            moveSteps.push(cur);
            if (manhattan(cur, closest) <= u.range) break;
        }

        if (!moveSteps.length) return this.time.delayedCall(400, tryAttackOrSkill);
        const finalPos = moveSteps[moveSteps.length - 1];
        this.uiMode = 'animating';
        this.log(`${u.name}이(가) 전진!`);
        this.faceTowardCol(u, finalPos.col);
        this.panCameraTo(finalPos.col * COL_W + COL_W / 2, 600);
        this.playEntityAnim(u, 'walk');
        this.tweens.add({
            targets: u,
            visualCol: finalPos.col, visualRow: finalPos.row,
            duration: 600, ease: 'Sine.easeInOut',
            onComplete: () => {
                u.col = finalPos.col;
                u.row = finalPos.row;
                this.turnState.moved = true;
                this.playEntityAnim(u, 'idle');
                this.time.delayedCall(300, tryAttackOrSkill);
            },
        });
    }

    // ─── 데미지 ─────────────────────────────
    computeDamage(atk, target, mult) {
        const base = atk * mult - target.def * 0.5;
        const variance = Phaser.Math.FloatBetween(0.85, 1.15);
        let dmg = Math.max(1, Math.round(base * variance));
        if (target.defending) dmg = Math.max(1, Math.round(dmg * 0.5));
        return dmg;
    }

    applyDamage(target, dmg) {
        target.hp -= dmg;
        // 뒤에서 맞으면 공격자 쪽으로 facing 전환 (같은 col 이면 변경 없음)
        const attacker = this.activeUnit;
        if (attacker && attacker !== target && attacker.col !== target.col) {
            const attackerSide = attacker.col > target.col ? 1 : -1;
            if (target.facing === -attackerSide) target.facing = attackerSide;
        }
        const sp = project(cellCenterCol(target.col), cellCenterRow(target.row), this.cameras.main.scrollX);
        this.popDamage(sp.x, sp.y - 50, dmg, target.defending);
        // 피격 시각 피드백: 스프라이트는 tint, 도형 합성은 박스 오버레이
        if (target.bodySprite && target.bodySprite.setTintFill) {
            target.bodySprite.setTintFill(0xff5577);
            this.time.delayedCall(150, () => target.bodySprite.clearTint());
        } else {
            this.flash(target.sprite, 0xff5577);
        }
        // 피격 anim 재생 (사망이 아닐 때만, 살아남으면 끝나고 idle 복귀)
        const willDie = target.hp - 0 <= 0; // hp 는 이미 감산됨, 0 이하면 사망 예정
        if (!willDie && target.visual && target.visual.anims && target.visual.anims.hit) {
            this.playEntityAnim(target, 'hit');
            this.waitForActionAnim(target, 'hit', 500, () => {
                if (target.alive) this.playEntityAnim(target, 'idle');
            });
        }
        // 좌우 흔들기 (offsetX 트윈)
        this.tweens.add({
            targets: target, offsetX: -8,
            duration: 60, yoyo: true, repeat: 2,
            onComplete: () => target.offsetX = 0,
        });
        if (target.hp <= 0) {
            target.hp = 0;
            target.alive = false;
            const hasDeadAnim = target.visual && target.visual.anims && target.visual.anims.dead;
            if (hasDeadAnim) {
                // 사망 애니메이션 — 기울기 없음, 알파만 약간 감소
                this.playEntityAnim(target, 'dead');
                target.bodySprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
                    target.bodySprite.anims.pause();
                });
                this.tweens.add({
                    targets: target.sprite, alpha: 0.75,
                    duration: 600,
                });
            } else if (target.bodySprite) {
                // 스프라이트 엔티티이지만 dead anim 없음 — 회전 없이 알파만 (idle 정지)
                if (target.bodySprite.anims) target.bodySprite.anims.pause();
                this.tweens.add({
                    targets: target.sprite, alpha: 0.45,
                    duration: 600,
                });
            } else {
                // 폴백 (도형 합성): 알파 + 기울기
                this.tweens.add({
                    targets: target.sprite,
                    alpha: 0.2, angle: target.side === 'ally' ? -75 : 75,
                    duration: 600,
                });
            }
            target.spriteIndicator.setVisible(false);
            this.log(`${target.name} 전투불능.`);
        }
        this.refreshHud();
    }

    // ─── 이펙트 ─────────────────────────────
    hitEffect(x, y, scale = 1) {
        const s = Phaser.Math.Clamp(scale, 0.4, 1.5);
        for (let i = 0; i < 8; i++) {
            const ang = (Math.PI * 2 / 8) * i;
            const line = this.add.rectangle(x, y, 24 * s, 3, 0xffffaa).setRotation(ang);
            line.setScrollFactor(0);
            this.tweens.add({
                targets: line,
                x: x + Math.cos(ang) * 36 * s,
                y: y + Math.sin(ang) * 36 * s,
                alpha: 0, duration: 260,
                onComplete: () => line.destroy(),
            });
        }
        const ring = this.add.circle(x, y, 8 * s, 0xffffff, 0.9).setScrollFactor(0);
        this.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 280, onComplete: () => ring.destroy() });
    }

    spellEffect(x, y, color, scale = 1) {
        const s = Phaser.Math.Clamp(scale, 0.4, 1.5);
        const ring = this.add.circle(x, y, 10 * s, color, 0.7).setScrollFactor(0);
        this.tweens.add({ targets: ring, scale: 8, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
        for (let i = 0; i < 12; i++) {
            const ang = (Math.PI * 2 / 12) * i + Math.random() * 0.2;
            const beam = this.add.rectangle(x, y, 60 * s, 4, color).setRotation(ang).setAlpha(0.9).setScrollFactor(0);
            this.tweens.add({
                targets: beam,
                x: x + Math.cos(ang) * 100 * s,
                y: y + Math.sin(ang) * 100 * s,
                alpha: 0, duration: 380,
                onComplete: () => beam.destroy(),
            });
        }
        const core = this.add.circle(x, y, 18 * s, 0xffffff, 1).setScrollFactor(0);
        this.tweens.add({ targets: core, scale: 3, alpha: 0, duration: 320, onComplete: () => core.destroy() });
    }

    popDamage(x, y, dmg, blocked) {
        const t = this.add.text(x, y, blocked ? `${dmg} !` : `${dmg}`, {
            fontSize: blocked ? '20px' : '26px',
            color: blocked ? '#aaddff' : '#ff5577',
            fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5).setScrollFactor(0);
        this.tweens.add({
            targets: t, y: y - 50, alpha: 0,
            duration: 800, ease: 'Cubic.easeOut',
            onComplete: () => t.destroy(),
        });
    }

    flash(sprite, color) {
        const overlay = this.add.rectangle(0, 0, 52, 72, color, 0.6);
        sprite.add(overlay);
        this.tweens.add({ targets: overlay, alpha: 0, duration: 300, onComplete: () => overlay.destroy() });
    }

    // ─── 종료 ─────────────────────────────
    endBattle(allyWon) {
        this.units.forEach(u => u.spriteIndicator.setVisible(false));
        this.uiMode = 'animating';
        this.updateActionMenu();

        const banner = this.add.text(VIEW_W / 2, 230,
            allyWon ? 'VICTORY' : 'DEFEAT',
            {
                fontSize: '64px',
                color: allyWon ? '#ffee66' : '#ff5577',
                fontStyle: 'bold', stroke: '#000', strokeThickness: 6,
            }
        ).setOrigin(0.5).setAlpha(0).setScale(0.5).setScrollFactor(0);
        this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: 600, ease: 'Back.easeOut' });

        const retry = this.add.text(VIEW_W / 2, 320, '클릭하여 재시작', {
            fontSize: '18px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setScrollFactor(0);
        retry.setInteractive({ useHandCursor: true });
        retry.on('pointerdown', () => this.scene.restart());
    }
}

// ─── 게임 부트 ─────────────────────────────
new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#000000',
    scene: [BattleScene],
    pixelArt: true,
});
