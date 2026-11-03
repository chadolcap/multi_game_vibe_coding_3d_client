// 로비 3D 섬에서 내 오리를 누르면 머리 위에 뜨는 행동 버튼 4개(앉기/일어서기/인사/점프).
// 순수 Pixi Container 라 서버/네트워크를 모른다. 씬이 SetAnchor() 로 매 프레임 오리 머리 위치를 알려 주고,
// 버튼을 누르면 onSelect(kind) 로 알린다.
import { Container, Graphics, Text } from "pixi.js";
import { MotionKind } from "../common/types";
import { CUTE_COLOR, CUTE_FONT_FAMILY } from "./CuteTheme";
import { GAME_WIDTH } from "../config";

const BUTTON_RADIUS = 46;
const BUTTON_GAP = 14;
// 양 끝 버튼을 조금 내려 머리 위로 둥글게 늘어서게 한다
const ARC_DROP = 20;
// 기준점(머리 위)에서 버튼 줄 가운데까지 위로 띄우는 거리
const ROW_OFFSET_Y = BUTTON_RADIUS + 6;
const SCREEN_MARGIN = 8;
const PRESSED_SCALE = 0.9;

interface MotionButtonSpec {
  kind: MotionKind;
  icon: string;
  label: string;
  color: number;
}

const MOTION_BUTTONS: MotionButtonSpec[] = [
  { kind: MotionKind.SIT, icon: "🪑", label: "앉기", color: CUTE_COLOR.shirt },
  { kind: MotionKind.STAND, icon: "🧍", label: "일어서기", color: CUTE_COLOR.mint },
  { kind: MotionKind.GREET, icon: "👋", label: "인사", color: CUTE_COLOR.pink },
  { kind: MotionKind.JUMP, icon: "⬆️", label: "점프", color: CUTE_COLOR.orange },
];

export class DuckMotionMenu extends Container {
  private readonly buttons: Container[] = [];

  constructor(onSelect: (kind: MotionKind) => void) {
    super();
    for (const spec of MOTION_BUTTONS) {
      const button = this.CreateButton(spec, onSelect);
      this.buttons.push(button);
      this.addChild(button);
    }
    this.visible = false;
  }

  public Show(): void {
    this.visible = true;
  }

  public Hide(): void {
    this.visible = false;
    for (const button of this.buttons) button.scale.set(1);
  }

  public Toggle(): void {
    if (this.visible) this.Hide();
    else this.Show();
  }

  // x, y = 오리 머리 위 화면 좌표(720x1280 기준). 버튼 줄이 화면 양옆을 넘지 않게 가운데를 당긴다.
  public SetAnchor(x: number, y: number): void {
    const step = BUTTON_RADIUS * 2 + BUTTON_GAP;
    const half_width = step * 1.5 + BUTTON_RADIUS;
    const center_x = Math.min(Math.max(x, half_width + SCREEN_MARGIN), GAME_WIDTH - half_width - SCREEN_MARGIN);
    const row_y = y - ROW_OFFSET_Y;
    this.buttons.forEach((button, index) => {
      const offset = index - 1.5; // -1.5, -0.5, 0.5, 1.5
      button.position.set(center_x + offset * step, row_y + (Math.abs(offset) > 1 ? ARC_DROP : 0));
    });
  }

  private CreateButton(spec: MotionButtonSpec, onSelect: (kind: MotionKind) => void): Container {
    const button = new Container();
    const shadow = new Graphics().circle(0, 5, BUTTON_RADIUS).fill({ color: 0x000000, alpha: 0.15 });
    const face = new Graphics()
      .circle(0, 0, BUTTON_RADIUS)
      .fill(CUTE_COLOR.cream)
      .stroke({ color: spec.color, width: 6 });
    const icon = new Text({ text: spec.icon, style: { fontSize: 30, fontFamily: CUTE_FONT_FAMILY } });
    icon.anchor.set(0.5);
    icon.position.set(0, -11);
    const label = new Text({
      text: spec.label,
      style: { fill: CUTE_COLOR.brown, fontSize: spec.label.length > 2 ? 15 : 18, fontFamily: CUTE_FONT_FAMILY },
    });
    label.anchor.set(0.5);
    label.position.set(0, 22);
    button.addChild(shadow, face, icon, label);

    button.eventMode = "static";
    button.cursor = "pointer";
    button.on("pointerdown", () => button.scale.set(PRESSED_SCALE));
    button.on("pointerupoutside", () => button.scale.set(1));
    button.on("pointerup", () => {
      button.scale.set(1);
      onSelect(spec.kind);
    });
    return button;
  }
}
