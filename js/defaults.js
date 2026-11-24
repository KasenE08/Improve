// Starting data. Copied into localStorage on first launch; after that the
// stored copy is the source of truth and everything is editable in the app.

export const DEFAULT_CATEGORIES = [
  { id: 'body', name: 'Body', icon: 'body' },
  { id: 'diet', name: 'Diet', icon: 'diet' },
  { id: 'skin', name: 'Skin & Hygiene', icon: 'skin' },
  { id: 'mind', name: 'Mind', icon: 'mind' },
  { id: 'work', name: 'Work', icon: 'scroll' },
  { id: 'money', name: 'Money', icon: 'money' },
  { id: 'style', name: 'Style', icon: 'style' },
  { id: 'people', name: 'People', icon: 'people' },
];

// The habit list (Atomic Habits overhaul, Nov 2026). Every habit is daily; some only show on some days.
// key: the habit's id on a fresh install. twoMin: the Minimum (2-minute) version, null = Full only.
// days: 'daily' | 'sun' (Sundays) | 'payday' (paydays). kind: 'goal' | 'lift' (5 sessions a week) | 'fastfood' (2 passes a week).
export const HABIT_CONTENT = [
  { key: 'sleep', name: 'Sleep', rule: '6 hours minimum · 8 recommended', category: 'body', xp: 30,
    twoMin: '6 hours', full: '8 hours', cue: 'Clocks / bedtime awareness (already automatic)',
    craving: 'Wake up refreshed, maximize gym gains, never sleep through my alarm',
    response: 'Phone out of sight 20 min before sleep (right after journaling)', reward: 'Wake up refreshed and on time' },
  { key: 'steps', name: '>9k steps', category: 'body', xp: 20, twoMin: '7k', full: '9k+', cue: 'Lock screen step widget',
    craving: 'Helps my cut + walking is how I decompress',
    response: 'Walk in the hour after getting home (before dark); backup: treadmill + something I only allow on it',
    reward: 'Decompression from the walk' },
  { key: 'stretching', name: 'Stretching', category: 'body', xp: 10, twoMin: '10 sec per stretch', full: '20 sec per stretch',
    cue: 'Wake up → stretch first thing', craving: 'Wakes me up, body feels lighter, fits who I am as a lifter',
    response: 'Set list of 6, same order every morning (~4 min)', reward: 'I feel awake' },
  { key: 'water', name: '100oz water', category: 'diet', xp: 30, auto: 'food:water', twoMin: '80oz', full: '100oz',
    cue: '40oz water bottle always on me', craving: 'Ice cold + sparkling options; Diet Coke counts',
    response: '40oz bottle, 2.5 refills (end of school / gym / after gym)', reward: 'Completion animation per bottle + bigger at 100oz' },
  { key: 'protein', name: '130g protein', category: 'diet', xp: 40, auto: 'food:protein', twoMin: '115g', full: '130g',
    cue: 'Hunger (built in)', craving: 'Meal-prepped food I actually enjoy + feeling healthy while eating',
    response: 'Lunch made in the morning (10 min); cook before work and before archery', reward: 'I feel good, not gross, after eating' },
  { key: 'calories', name: '~2200 calories', category: 'diet', xp: 60, auto: 'food:calories', twoMin: '1,980–2,700',
    full: '1,980–2,420 (2,200 ±10%)', cue: 'Hunger (built in)', craving: 'Meal-prepped food I actually enjoy + feeling healthy while eating',
    response: 'Lunch made in the morning (10 min); cook before work and before archery', reward: 'I feel good, not gross, after eating' },
  { key: 'no-tv', name: 'No Night TV', category: 'mind', xp: 60, twoMin: null, full: 'Full only', cue: 'Already set',
    craving: 'When the urge hits: "How will I feel in 20 minutes?"', response: 'Uninstall the apps + cold water / move from place',
    reward: 'Any slip resets the streak to 0' },
  { key: 'read', name: 'Read', category: 'mind', xp: 20, twoMin: '2 pages', full: '10 pages / finish the chapter',
    cue: 'Book on my pillow, placed every morning when I make my bed', craving: "I enjoy the books I'm reading",
    response: 'Book on my pillow, zero friction', reward: "Another vote for the not-normal life I'm building" },
  { key: 'journal', name: 'Journal', category: 'mind', xp: 15, auto: 'journal:words', twoMin: '25 words', full: '100 words',
    cue: 'Finish AI automation post → journal', craving: 'Get my thoughts out, overthink less, fall asleep easier',
    response: '1 tap from Improve', reward: 'Peace, a clear head' },
  { key: 'make-bed', name: 'Make bed + pick up room', category: 'mind', xp: 10, twoMin: 'Make bed only', full: 'Bed + pick up room',
    cue: 'Finish stretching → make bed + room',
    craving: 'Sets the tone for my day, walk into a clean room, less to do before the cleaners come',
    response: 'Quick make (covered + even) + visible laundry basket', reward: 'I feel clean, fresh start to the day' },
  { key: 'ai-post', name: 'AI automation >> Post', category: 'work', xp: 30, twoMin: 'Post something (no building)',
    full: 'AI automation work + post', cue: 'Laptop open with workflow / Claude chat already pulled up',
    craving: 'I enjoy learning and building it; every post is a step closer to my dream life',
    response: "Plan tomorrow's topic at the end of today's session", reward: 'Another vote for my dream life, shipped publicly' },
  { key: 'lift', name: 'Lift', category: 'body', xp: 40, kind: 'lift', target: 5, twoMin: '1 exercise per muscle group', full: 'Full session',
    cue: '8 PM block, home gym', craving: 'I feel extremely confident while lifting',
    response: 'Just lift the first weight; home gym + set split = zero friction', reward: 'Confidence that lasts the rest of the night' },
  { key: 'fast-food', name: 'Fast food', category: 'diet', xp: 40, kind: 'fastfood', target: 2, twoMin: null, full: 'No fast food today',
    cue: 'Prepped meals on hand', craving: '"This $ isn\'t going to the bike" + long-term bloat', response: 'Hid the mobile-order apps',
    reward: 'Past 2 passes = streak resets to 0' },
  { key: 'log-spending', name: 'Sunday money check-in', category: 'money', xp: 15, auto: 'money:checkin', days: 'sun', twoMin: null, full: 'Done',
    cue: 'Improve app', craving: 'Seeing my progress while I do it', response: 'Already easy, takes seconds', reward: 'The graph showing my progress' },
  { key: 'save-paycheck', name: 'Save % of paycheck', category: 'money', xp: 20, auto: 'money:save', days: 'payday', twoMin: null, full: 'Done',
    cue: 'Paycheck deposit', craving: 'Seeing my progress grow', response: 'Already easy', reward: 'Watching every category go up' },
];
export const CONTENT_FIELDS = ['name', 'rule', 'category', 'twoMin', 'full', 'cue', 'craving', 'response', 'reward', 'days', 'kind', 'target', 'auto'];

export const DEFAULT_HABITS = HABIT_CONTENT.map((c, order) => ({
  id: c.key, name: c.name, rule: c.rule || null, category: c.category, frequency: 'daily', target: c.target || 1, xp: c.xp,
  order, archived: false, auto: c.auto || null, kind: c.kind || 'goal', days: c.days || 'daily',
  twoMin: c.twoMin, full: c.full, cue: c.cue, craving: c.craving, response: c.response, reward: c.reward,
}));

export const DEFAULT_PROFILE = { name: 'KASEN' };
