export interface BattleDef {
  id: string;
  name: string;
  rows: string[];
  winText: string;
  loseText: string;
  /** 击败这个人就胜利；不填则全歼敌人才算胜利 */
  winDefeat?: string;
  /** 这个人撤退就失败 */
  leader: string;
  /** 我方出场位置，写了 id 的位置留给那个人 */
  deploy: { x: number; y: number; id?: string }[];
  enemies: { id: string; x: number; y: number; level?: number; boss?: boolean; hold?: boolean }[];
}

// 第一战的布局是按攻略片段（敌人有渔人、刀客、拳师，胜利条件击败李逵，
// 失败条件晁盖撤退）自己设计的，原版地图拿到 ROM 后替换。
export const BATTLES: Record<string, BattleDef> = {
  shijiacun: {
    id: 'shijiacun',
    name: '史家村之战',
    rows: [
      'TT.TTwwwwGGwwww.T~~T',
      'T........,,.....T~~T',
      'T.RRR....,,..RRR.~~T',
      'T.WWW..T.,,..WWW.~~.',
      '..T......,,...T..~~.',
      ',,,,,,,,,,,,,,,,,==,',
      '.FFF.....,,..TT..~~.',
      '.FFF..h..,,..TT..~~T',
      'T........,,......~~T',
      'T.RRR....,,..RRR.~~T',
      'T.WWW....,,..WWW.~~T',
      'T..T.....,,......~~T',
      'TT.......,,....T.~~T',
      'TTT......,,...TTT~~T',
    ],
    winText: '击败 李逵',
    loseText: '晁盖 撤退',
    winDefeat: 'likui',
    leader: 'chaogai',
    deploy: [
      { x: 9, y: 12, id: 'chaogai' },
      { x: 10, y: 12, id: 'shijin' },
      { x: 8, y: 13 },
      { x: 10, y: 13 },
      { x: 11, y: 13 },
      { x: 7, y: 12 },
    ],
    enemies: [
      { id: 'likui', x: 9, y: 1, boss: true, hold: true },
      { id: 'bandit_blade', x: 5, y: 5, level: 1 },
      { id: 'bandit_blade', x: 12, y: 4, level: 1, hold: true },
      { id: 'bandit_boxer', x: 11, y: 7, level: 1, hold: true },
      { id: 'bandit_boxer', x: 4, y: 8, level: 1 },
      { id: 'bandit_fisher', x: 17, y: 7, level: 1, hold: true },
      { id: 'bandit_fisher', x: 18, y: 10, level: 1, hold: true },
    ],
  },
};
