import type { ItemId } from '../data/items';
import type { GameState } from '../game/state';

/** 战斗中能用的剧情接口。 */
export interface BattleTalk {
  say(who: string, text: string): Promise<void>;
  msg(text: string): Promise<void>;
}

export interface BattleHooks {
  onStart?: (api: BattleTalk) => Promise<void>;
  /** 首领开始出击时 */
  onBossWake?: (api: BattleTalk) => Promise<void>;
}

/** 探索地图上剧情脚本能用的接口。 */
export interface StoryApi extends BattleTalk {
  readonly state: GameState;
  ask(who: string | null, text: string, options: string[]): Promise<number>;
  narrate(lines: string[], title?: string, subtitle?: string): Promise<void>;
  give(item: ItemId, n?: number): Promise<void>;
  join(id: string): Promise<void>;
  flag(key: string): number;
  set(key: string, value?: number): void;
  /** 进入战斗，打赢了才返回（输了会回到标题或重打） */
  battle(id: string, hooks?: BattleHooks): Promise<void>;
  /** 自动存档 */
  save(): void;
  /** 把主角往回推一步（比如出口还不能走） */
  stepBack(): void;
  wait(ms: number): Promise<void>;
  toTitle(): Promise<void>;
}

export type StoryEvent = (api: StoryApi) => Promise<void>;
