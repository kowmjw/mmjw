// 画面下方的操作提示栏（网页元素，不画在游戏画面里），告诉玩家下一步该做什么。
// 场景每帧调用 setHint，内容没变时不会重复改 DOM。

export interface HintButton {
  label: string;
  onClick: () => void;
}

let textEl: HTMLElement | null = null;
let buttonEl: HTMLButtonElement | null = null;
let shownText: string | null = null;
let shownLabel: string | null = null;
let onClick: (() => void) | null = null;

export function initHint(root: HTMLElement) {
  textEl = root.querySelector<HTMLElement>('.hint-text');
  buttonEl = root.querySelector<HTMLButtonElement>('button');
  buttonEl?.addEventListener('click', (e) => {
    e.preventDefault();
    onClick?.();
  });
}

export function setHint(text: string, button: HintButton | null = null) {
  onClick = button?.onClick ?? null;
  if (textEl && text !== shownText) {
    shownText = text;
    textEl.textContent = text;
  }
  const label = button?.label ?? '';
  if (buttonEl && label !== shownLabel) {
    shownLabel = label;
    buttonEl.textContent = label;
    buttonEl.hidden = !label;
  }
}
