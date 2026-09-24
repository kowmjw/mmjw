// 第一章「史家村」的剧情。台词是自己写的临时版本（原版剧情以原创为主，
// 细节网上查不全），拿到原版 ROM 后按原台词替换。
import type { BattleHooks, StoryApi, StoryEvent } from './api';

const SHIJIACUN_BATTLE: BattleHooks = {
  async onStart(t) {
    await t.say('likui', '哪个是史家村的？都给俺出来受死！');
    await t.say('shijin', '好大的口气！看我的枪！');
    await t.say('wuyong', '保正，那黑大汉凶悍得很。先收拾掉周围的喽啰，再合力对付他。');
    await t.say('wuyong', '史大郎的长枪专克水边的渔人；刘唐兄弟赤手空拳，别去硬碰使刀的。');
    await t.msg('【操作】点我方人物，再点蓝色格子移动，然后选「攻击」并点敌人。点空地可以结束回合。');
  },
  async onBossWake(t) {
    await t.say('likui', '来得好！吃俺一斧！');
  },
};

async function arrive(api: StoryApi) {
  if (api.flag('arrived')) return;
  api.set('arrived');
  await api.narrate([
    '北宋徽宗年间，太尉高俅把持朝政，',
    '贪官污吏横行，天下百姓苦不堪言。',
    '',
    '郓城县东溪村的保正晁盖，仗义疏财，',
    '专爱结交天下好汉。',
    '这一日，他与好友吴用、刘唐来到华阴县史家村，',
    '拜访一位身刺九条青龙的少年英雄——',
    '九纹龙史进。',
  ]);
  await api.narrate([], '第一章', '史家村');
  await api.say('wuyong', '保正，前面就是史家村了。史家庄在村子最北边。');
  await api.say('liutang', '听说那史进枪棒了得，俺倒要见识见识！');
  await api.say('chaogai', '好，我们进村去吧。');
  await api.msg('【操作】方向键或点地面走路；走到人物旁边按 A 键（或直接点他）对话；按「菜单」查看队伍、存档。');
  api.save();
}

async function shijin(api: StoryApi) {
  await api.say('shijin', '你们是什么人？来我史家庄有何贵干？');
  await api.say('chaogai', '在下东溪村晁盖，久闻九纹龙大名，特来拜访。');
  await api.say('shijin', '原来是托塔天王晁保正！小弟久仰大名，快请进！');
  await api.say('wuyong', '史大郎，我等此来，是想与你共商一件大事……');
  await api.say('servant', '不好了！少庄主，一伙强人闯进村子来了！领头的是个黑大汉，拎着两把板斧，见人就砍！');
  await api.say('shijin', '什么？竟敢到史家村撒野！');
  await api.say('chaogai', '史兄弟，我们与你一起去会会他！');
  await api.say('shijin', '好！有劳各位哥哥！');
  await api.join('shijin');
  await api.battle('shijiacun', SHIJIACUN_BATTLE);
  // 打赢了才记下来：输了会回标题，读档后还能再找史进开战
  api.set('shijin_joined');

  await api.say('likui', '哎哟……好厉害！俺铁牛服了！');
  await api.say('chaogai', '你是何人？为何带人来村里闹事？');
  await api.say('likui', '俺叫李逵，人称黑旋风。俺听人说史家村窝藏了高俅的狗腿子，这才来找茬的！');
  await api.say('wuyong', '史家村世代良民，哪来的高俅走狗？怕是有人故意挑拨，要借你的手生事。');
  await api.say('likui', '啊？！那俺岂不是上了当……是俺铁牛鲁莽了，给各位哥哥赔罪！');
  await api.say('chaogai', '不知者不罪。李逵兄弟，我看你是条直爽的汉子，可愿随我们一起，替天行道？');
  await api.say('likui', '愿意！愿意！俺以后就跟着晁天王干了！');
  await api.join('likui');
  await api.say('wuyong', '保正，小生打听到，北京大名府的梁中书要押送十万贯金珠宝贝，给他丈人蔡太师庆贺生辰……');
  await api.say('chaogai', '那都是搜刮来的民脂民膏！');
  await api.say('wuyong', '正是。此事还需从长计议。大家先在村里歇歇脚，准备好了就从南边村口出发。');
  api.set('chapter1_clear');
  api.save();
}

async function villageExit(api: StoryApi) {
  if (!api.flag('shijin_joined')) {
    await api.say('wuyong', '保正，还没见到史进呢，先别急着走。');
    api.stepBack();
    return;
  }
  const i = await api.ask('wuyong', '行装都准备好了。要出发前往黄泥冈吗？', ['出发', '再等等']);
  if (i !== 0) {
    api.stepBack();
    return;
  }
  await api.narrate(['众好汉辞别史家村，', '踏上了前往黄泥冈的道路……']);
  await api.narrate([], '第二章', '智取生辰纲');
  await api.narrate(['试玩版到这里就结束了，感谢游玩！', '', '后续章节会随着原版资料的整理陆续加入。']);
  api.stepBack();
  api.save();
  await api.toTitle();
}

function talk(before: [string, string][], after?: [string, string][]): StoryEvent {
  return async (api) => {
    const lines = after && api.flag('chapter1_clear') ? after : before;
    for (const [who, text] of lines) await api.say(who, text);
  };
}

export const EVENTS: Record<string, StoryEvent> = {
  arrive,
  shijin,
  village_exit: villageExit,
  servant: talk([['servant', '少庄主就在院子里练枪呢。']], [['servant', '少庄主说要跟各位好汉出去闯荡一番。老太公那边，小的会照看好的。']]),
  villager: talk(
    [['villager', '最近少华山上的强人常下山来闹事，大伙儿都提心吊胆的。']],
    [['villager', '多亏各位好汉，村子总算太平了！']],
  ),
  farmer: talk(
    [['farmer', '史大郎天天在庄前练武，一条棍棒使得虎虎生风。']],
    [['farmer', '还好庄稼没被踩坏……各位好汉，多谢了！']],
  ),
  child: talk(
    [['child', '九纹龙哥哥身上刺着九条青龙，可威风啦！']],
    [['child', '那个黑脸大汉原来是好人呀？他刚才还摸了摸我的头。']],
  ),
  fisherman: talk([['fisherman', '河里的鱼这几天都不见了，怕是要出什么事……']], [['fisherman', '嘿，鱼又回来啦！']]),
  hunter: talk([
    ['hunter', '柜子里有本《弓术指南》，是俺爹留下的。俺也看不懂，你们用得着就拿去吧。'],
    ['hunter', '听说带在身上，出手能更准些。'],
  ]),
  granny: talk([
    ['granny', '罐子里有些伤药，你们拿去用吧。'],
    ['granny', '出门在外，千万小心呐。'],
  ]),
  woman: talk([['woman', '当家的上山打柴去了……外面不太平，你们也要当心。']], [['woman', '当家的回来了，说山上的强人都散了。']]),
  girl: talk([['girl', '哥哥，你们是来找史大郎的吗？他就在北边的大宅子里。']], [['girl', '哥哥们要走了吗？路上小心哦！']]),
};
