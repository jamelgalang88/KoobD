// Writing Practice's built-in checker (js/writing.js): reads a student's
// English or Tagalog writing and returns suggestions tied to exact places in
// the text, plus the numbers and the end-of-challenge feedback.
//
//   const result = KoobdWritingChecker.check(text, 'en' | 'tl', spell);
//   // result.issues: [{ id, key, start, end, type, title, message, suggestions,
//   //                   definite, example }]
//   // result.stats:  words, sentences, paragraphs, ...
//   const summary = KoobdWritingChecker.feedback(text, lang, result, extra);
//
// spell: what writing_api.php (hunspell) said about each word - { word: { en,
// tl, suggest } }; words not in it yet are simply not spell-checked.
// Types and their colours (css/writing.css): spelling (red), grammar (orange:
// grammar, prefixes and suffixes, sentence structure), organization (blue),
// vocabulary (purple, optional ideas), mismatch (yellow: the other language),
// emoji (blue, with its own label). Definite mistakes are told apart from
// optional ideas, and correct Tagalog is never judged by English grammar.
(function () {
  const WORD = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;
  const EMOJI = /(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)+/gu;
  const lower = (text) => String(text).toLocaleLowerCase();
  const cap = (text) => text.charAt(0).toLocaleUpperCase() + text.slice(1);
  const keepCase = (from, to) => (/^\p{Lu}/u.test(from) ? cap(to) : to);

  // --- Word lists -----------------------------------------------------------------------------------------
  // English words with an everyday Tagalog word (a Tagalog notepad suggests it;
  // the Dictionary is asked for anything else).
  const EN_TL = {
    school: 'paaralan', teacher: 'guro', student: 'mag-aaral', students: 'mga mag-aaral', house: 'bahay', home: 'tahanan', mother: 'nanay', father: 'tatay',
    family: 'pamilya', friend: 'kaibigan', friends: 'mga kaibigan', dog: 'aso', cat: 'pusa', bird: 'ibon', fish: 'isda', water: 'tubig', food: 'pagkain',
    rice: 'kanin', tree: 'puno', trees: 'mga puno', flower: 'bulaklak', sun: 'araw', moon: 'buwan', star: 'bituin', sky: 'langit', rain: 'ulan',
    happy: 'masaya', sad: 'malungkot', beautiful: 'maganda', big: 'malaki', small: 'maliit', good: 'mabuti', bad: 'masama', fast: 'mabilis', slow: 'mabagal',
    because: 'dahil', but: 'pero', and: 'at', very: 'napaka', today: 'ngayon', yesterday: 'kahapon', tomorrow: 'bukas', morning: 'umaga', night: 'gabi',
    book: 'aklat', books: 'mga aklat', love: 'pagmamahal', play: 'maglaro', played: 'naglaro', eat: 'kumain', ate: 'kumain', went: 'pumunta', go: 'pumunta',
    run: 'tumakbo', ran: 'tumakbo', read: 'magbasa', write: 'sumulat', wrote: 'sumulat', sleep: 'matulog', slept: 'natulog', see: 'makita', saw: 'nakita',
    help: 'tulong', thank: 'salamat', thanks: 'salamat', please: 'pakiusap', yes: 'oo', no: 'hindi', always: 'palagi', never: 'hindi kailanman',
    children: 'mga bata', child: 'bata', baby: 'sanggol', sister: 'kapatid na babae', brother: 'kapatid na lalaki', city: 'lungsod', town: 'bayan',
    beach: 'dalampasigan', sea: 'dagat', river: 'ilog', mountain: 'bundok', forest: 'gubat', road: 'daan', story: 'kuwento', game: 'laro', fun: 'masaya',
    afraid: 'takot', angry: 'galit', tired: 'pagod', hungry: 'gutom', sick: 'may sakit', new: 'bago', old: 'luma', hot: 'mainit', cold: 'malamig'
  };
  // Tagalog words with an everyday English word (for an English notepad).
  const TL_EN = {
    bahay: 'house', paaralan: 'school', guro: 'teacher', nanay: 'mother', tatay: 'father', kaibigan: 'friend', aso: 'dog', pusa: 'cat', tubig: 'water',
    pagkain: 'food', kanin: 'rice', masaya: 'happy', malungkot: 'sad', maganda: 'beautiful', malaki: 'big', maliit: 'small', mabuti: 'good', ngayon: 'today',
    kahapon: 'yesterday', bukas: 'tomorrow', salamat: 'thank you', oo: 'yes', hindi: 'no', pero: 'but', dahil: 'because', kasi: 'because', talaga: 'really',
    bata: 'child', sige: 'okay', ulan: 'rain', araw: 'sun / day', gabi: 'night', umaga: 'morning', laro: 'game', kuwento: 'story', aklat: 'book', libro: 'book'
  };
  // English words a Tagalog writer uses as they are: no everyday Tagalog word
  // replaces them, so they are not language mismatches.
  const BORROWED = new Set(('computer cellphone cell phone internet online offline email video videos game games gadget gadgets laptop tablet app apps website '
    + 'basketball volleyball football badminton chess tv radio bus jeep jeepney taxi tricycle pizza burger hamburger spaghetti sandwich chocolate cake ice cream '
    + 'okay ok hello hi bye project projects assignment quiz exam module modules grade section recess ballpen notebook crayons crayon pencil eraser '
    + 'facebook youtube tiktok google wifi selfie mall cartoon cartoons robot robots dinosaur zoo').split(' '));
  const RUDE = {
    en: { stupid: 'silly', idiot: 'person', dumb: 'confusing' },
    tl: { bobo: 'hindi pa alam', tanga: 'nagkamali', gago: 'pasaway', ulol: 'pasaway', inutil: 'nahihirapan' }
  };
  const IRREGULAR = {
    goed: 'went', runned: 'ran', eated: 'ate', buyed: 'bought', catched: 'caught', teached: 'taught', thinked: 'thought', bringed: 'brought', swimmed: 'swam',
    writed: 'wrote', falled: 'fell', maked: 'made', drinked: 'drank', drived: 'drove', sleeped: 'slept', feeled: 'felt', knowed: 'knew', growed: 'grew',
    throwed: 'threw', drawed: 'drew', flied: 'flew', hided: 'hid', gived: 'gave', taked: 'took', comed: 'came', sitted: 'sat', standed: 'stood', telled: 'told',
    finded: 'found', getted: 'got', leaved: 'left', meeted: 'met', payed: 'paid', sayed: 'said', seed: null, speaked: 'spoke', stealed: 'stole', winned: 'won',
    childs: 'children', womans: 'women', foots: 'feet', tooths: 'teeth', mouses: 'mice', gooses: 'geese', sheeps: 'sheep', fishes: null, peoples: null,
    gooder: 'better', goodest: 'best', badder: 'worse', bestest: 'best', beautifuler: 'more beautiful', beautifulest: 'most beautiful', funner: null
  };
  const PREFIX = {
    unpossible: 'impossible', unpolite: 'impolite', inpolite: 'impolite', unregular: 'irregular', unlegal: 'illegal', inlegal: 'illegal',
    unresponsible: 'irresponsible', unpatient: 'impatient', unhonest: 'dishonest', unappear: 'disappear', unproper: 'improper', unperfect: 'imperfect',
    unmature: 'immature', unlogical: 'illogical', unability: 'inability', irregardless: 'regardless', unagree: 'disagree', unlike: null, dislike: null,
    unpossibly: 'impossibly', unrespectful: 'disrespectful', inrespectful: 'disrespectful', uncorrect: 'incorrect', unvisible: 'invisible'
  };
  const VERY = {
    big: 'huge', small: 'tiny', happy: 'overjoyed', sad: 'heartbroken', tired: 'exhausted', good: 'excellent', bad: 'terrible', scared: 'terrified',
    cold: 'freezing', hot: 'scorching', fast: 'speedy', hungry: 'starving', angry: 'furious', pretty: 'gorgeous', beautiful: 'stunning', loud: 'deafening',
    quiet: 'silent', smart: 'brilliant', funny: 'hilarious', old: 'ancient', clean: 'spotless', dirty: 'filthy', tall: 'towering', surprised: 'astonished'
  };
  const OVERUSED = {
    en: { good: ['great', 'wonderful', 'pleasant'], nice: ['kind', 'lovely', 'friendly'], bad: ['awful', 'unpleasant', 'harmful'], big: ['huge', 'enormous', 'giant'],
      small: ['little', 'tiny', 'miniature'], happy: ['cheerful', 'delighted', 'joyful'], sad: ['gloomy', 'upset', 'unhappy'], said: ['shouted', 'whispered', 'replied', 'explained'],
      went: ['walked', 'hurried', 'traveled'], got: ['received', 'earned', 'found'], thing: ['object', 'item', 'idea'], things: ['objects', 'items', 'ideas'],
      stuff: ['things', 'belongings', 'materials'], fun: ['exciting', 'enjoyable', 'playful'], really: ['truly', 'extremely', 'very'], beautiful: ['lovely', 'stunning', 'gorgeous'] },
    tl: { maganda: ['marikit', 'kaakit-akit', 'kahanga-hanga'], masaya: ['natutuwa', 'nagagalak', 'maligaya'], malungkot: ['nalulumbay', 'namimighati', 'matamlay'],
      malaki: ['napakalaki', 'malawak', 'dambuhala'], maliit: ['munti', 'kakarampot', 'katiting'], talaga: ['tunay', 'lubos', 'sadyang'], mabait: ['magalang', 'matulungin', 'maalalahanin'],
      sabi: ['sigaw', 'bulong', 'tugon', 'paliwanag'], pumunta: ['naglakad', 'nagmadali', 'naglakbay'] }
  };
  const CONNECTORS = { en: new Set(['and', 'then', 'so']), tl: new Set(['at', 'tapos', 'pagkatapos', 'saka']) };
  // Words a name follows: si Ana, kay Lola Nena, a girl named Mia, Kuya Ben.
  const NAME_AFTER = {
    tl: new Set(['si', 'ni', 'kay', 'sina', 'nina', 'kina']),
    en: new Set(['named', 'called'])
  };
  const NAME_TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'sir', 'madam', 'g', 'gng', 'bb', 'ginoong', 'ginang', 'binibining', 'lola', 'lolo', 'tito', 'tita',
    'tiyo', 'tiya', 'ate', 'kuya', 'aling', 'mang', 'manong', 'manang', 'teacher', 'titser', 'king', 'queen', 'prince', 'princess', 'haring', 'reyna', 'prinsipe',
    'prinsesa', 'captain', 'kapitan', 'uncle', 'aunt', 'auntie', 'grandma', 'grandpa', 'san', 'santa', 'santo', 'mt', 'mount', 'bundok', 'lake', 'lawa']);
  const MANNER_TL = new Set(['mabilis', 'mabagal', 'malakas', 'mahina', 'maayos', 'maingat', 'tahimik', 'mabuti', 'masigla', 'masaya', 'malungkot', 'maaga', 'huli']);
  const TL_FUNCTION = new Set(['ang', 'ng', 'sa', 'ay', 'na', 'at', 'mga', 'si', 'ni', 'kay', 'ko', 'mo', 'siya', 'ako', 'ka', 'kami', 'tayo', 'sila']);
  const EN_FUNCTION = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'is', 'was', 'it', 'i']);

  // Questions. English: a question word or a helping verb first ("What...",
  // "Do you...", "Can we..."), or a question tag at the end ("..., right",
  // "isn't it"). Tagalog: a question word first (Ano, Bakit, Paano, Sino...),
  // or "ba" near the start ("Kumain ka na ba"). A "when/where/if" sentence
  // with a comma tells something ("When I got home, I slept."), and
  // "What a..." / "How + feeling" with "!" is an exclamation.
  const EN_ASK = new Set(['what', 'why', 'how', 'who', 'whom', 'whose', 'where', 'when', 'which']);
  const EN_AUX = new Set(['is', 'are', 'am', 'was', 'were', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'shall', 'may', 'might', 'have', 'has', 'had',
    "isn't", "aren't", "wasn't", "weren't", "don't", "doesn't", "didn't", "can't", "couldn't", "won't", "wouldn't", "shouldn't", "haven't", "hasn't"]);
  const TL_ASK = new Set(['ano', 'anong', 'bakit', 'paano', 'paanong', 'sino', 'sinong', 'sinu-sino', 'saan', 'saang', 'nasaan', 'kailan', 'alin', 'aling', 'ilan', 'ilang',
    'magkano', 'kanino', 'gaano']);
  function isQuestion(sentence, lang) {
    const words = sentence.words.map((word) => word.low.replace(/[’]/g, "'"));
    const first = words[0];
    const body = sentence.text;
    if (lang === 'tl') {
      // "Saan man...", "Kahit ano..." tell something.
      if (words[1] === 'man') return false;
      if (TL_ASK.has(first)) return true;
      // "ba" near the start: Kumain ka na ba? May pera ka ba? Puwede ba akong sumama?
      const ba = words.indexOf('ba');
      return ba > 0 && ba <= 4;
    }
    if (/,\s*(right|okay|ok)\s*[.!]?["”']?$/i.test(body) || /\b(isn't it|aren't you|don't you|didn't you|can't you|won't you|isn't she|isn't he)\s*[.!]?["”']?$/i.test(body)) return true;
    if (EN_ASK.has(first)) {
      if ((first === 'what' && ['a', 'an'].includes(words[1])) || (first === 'how' && /!/.test(body))) return false;
      if (['when', 'where'].includes(first) && body.includes(',')) return false;
      return true;
    }
    // "Is it raining", "Do you like..." - a helping verb, then who it is about.
    return EN_AUX.has(first) && ['i', 'you', 'he', 'she', 'it', 'we', 'they', 'there', 'this', 'that', 'the', 'a', 'an', 'my', 'your', 'his', 'her', 'our', 'their', 'anyone', 'someone', 'everyone'].includes(words[1] || '');
  }

  const needsAn = (word) => {
    const w = lower(word);
    if (/^(hour|honest|honou?r|heir)/.test(w)) return true;
    if (/^(uni|use|usu|uti|ufo|eu|one|once|ewe)/.test(w)) return false;
    return /^[aeiou]/.test(w);
  };

  // --- Reading the text ------------------------------------------------------------------------------------
  function read(text) {
    const words = [];
    for (const match of text.matchAll(WORD)) {
      const raw = match[0].replace(/[-'’]+$/, '');
      if (!raw) continue;
      words.push({ text: raw, low: lower(raw), start: match.index, end: match.index + raw.length });
    }
    // Sentences: up to . ! ? (with closing quotes), or the end of a line.
    const sentences = [];
    const sentenceRe = /[^.!?…\n]+(?:[.!?…]+["'”’)\]]*|(?=\n)|$)/g;
    for (const match of text.matchAll(sentenceRe)) {
      const body = match[0];
      const lead = body.length - body.trimStart().length;
      const trimmed = body.trim();
      if (!trimmed || !/[\p{L}\p{N}]/u.test(trimmed)) continue;
      const start = match.index + lead;
      sentences.push({ start, end: start + trimmed.length, text: trimmed, ended: /[.!?…]["'”’)\]]*$/.test(trimmed) });
    }
    sentences.forEach((sentence) => { sentence.words = words.filter((word) => word.start >= sentence.start && word.end <= sentence.end); });
    words.forEach((word, index) => { word.index = index; });
    sentences.forEach((sentence) => { if (sentence.words[0]) sentence.words[0].first = true; });
    // Paragraphs: blocks of text between line breaks.
    const paragraphs = [];
    for (const match of text.matchAll(/[^\n]+/g)) {
      if (!match[0].trim()) continue;
      const start = match.index + (match[0].length - match[0].trimStart().length);
      paragraphs.push({ start, end: start + match[0].trim().length, sentences: sentences.filter((s) => s.start >= start && s.end <= match.index + match[0].length) });
    }
    const emojis = [];
    for (const match of text.matchAll(EMOJI)) emojis.push({ start: match.index, end: match.index + match[0].length, text: match[0], count: Array.from(match[0].matchAll(/\p{Extended_Pictographic}/gu)).length });
    return { words, sentences, paragraphs, emojis };
  }

  // --- Names ------------------------------------------------------------------------------------------------
  // Which words are names of people, places, characters or pets, from the
  // sentence around them: a capital letter in the middle of a sentence, a
  // word the dictionary knows only as a name (Maria, Manila), a word after
  // si/ni/kay, "named" or a title (Kuya Ben), "My name is ...", or (Tagalog)
  // a capitalized first word before "ay". Once a word is a name it is a name
  // everywhere in the piece, unless it is also an everyday word written in
  // small letters (Rose / a red rose). Returns the word indexes.
  function findNames(doc, text, lang, spell) {
    const { words } = doc;
    const infoOf = (word) => spell[word.text] || spell[word.low] || null;
    const base = (word) => word.low.replace(/['’]s$/u, '');
    const capital = (word) => /^\p{Lu}/u.test(word.text);
    const shouting = (word) => word.text.length > 1 && word.text === word.text.toLocaleUpperCase();
    const joined = (a, b) => a && b && /^\s+$/.test(text.slice(a.end, b.start));
    const everyday = (word) => { const info = infoOf(word); return Boolean(info && !info.name && (info.en || info.tl)); };
    const found = new Set();
    const named = new Set();
    words.forEach((word, i) => {
      if (word.low.length < 2) return;   // "I", "a"
      const prev = joined(words[i - 1], word) ? words[i - 1] : null;
      const info = infoOf(word);
      const quoteBefore = /["“‘(]$/.test(text.slice(Math.max(0, word.start - 1), word.start));
      let name = false;
      if (info && info.name) name = true;
      else if (capital(word) && !word.first && !quoteBefore && !shouting(word)) name = true;
      else if (prev && (NAME_AFTER[lang].has(prev.low) || (capital(prev) && NAME_TITLES.has(prev.low)))) {
        // "wala ni isa", "named after": an everyday small-letter word is not a name.
        name = capital(word) || !(info && info[lang]);
      } else if (prev && ['is', 'ay'].includes(prev.low) && words.slice(Math.max(0, i - 4), i - 1).some((w) => ['name', 'names', 'pangalan'].includes(w.low))) {
        name = capital(word) || !(info && info[lang]);
      } else if (lang === 'tl' && word.first && capital(word) && words[i + 1] && words[i + 1].low === 'ay' && !(info && info.tl)) {
        name = true;
      }
      if (name) { found.add(i); named.add(base(word)); }
    });
    words.forEach((word, i) => {
      if (found.has(i) || !named.has(base(word))) return;
      if (capital(word) || !everyday(word)) found.add(i);
    });
    return found;
  }

  // --- Checking -----------------------------------------------------------------------------------------------
  function check(text, lang, spell = {}, options = {}) {
    const doc = read(text);
    const { words, sentences, paragraphs, emojis } = doc;
    const issues = [];
    const taken = [];   // word ranges already explained by a more specific rule
    const other = lang === 'tl' ? 'en' : 'tl';
    const add = (issue) => {
      issue.key = `${issue.type}:${issue.rule}:${lower(text.slice(issue.start, issue.end))}`;
      issues.push(issue);
      if (issue.type !== 'organization') taken.push([issue.start, issue.end]);
    };
    const isTaken = (start, end) => taken.some(([a, b]) => start < b && end > a);
    const span = (from, to) => ({ start: from.start, end: to.end });
    const nameAt = findNames(doc, text, lang, spell);
    const isName = (word) => nameAt.has(word.index);

    // Words that are rude or unkind.
    words.forEach((word) => {
      const kinder = RUDE[lang][word.low] || RUDE[other][word.low];
      if (!kinder) return;
      add({ ...span(word, word), type: 'spelling', rule: 'rude', definite: true, title: 'Unkind word',
        message: lang === 'tl' ? `"${word.text}" can hurt someone's feelings. Try a kinder word that still says what you mean.` : `"${word.text}" can hurt someone's feelings. Try a kinder word that still says what you mean.`,
        suggestions: [keepCase(word.text, kinder)] });
    });

    // Names start with a capital letter (si maria -> si Maria). A name is
    // otherwise left as the student wrote it: never respelled or translated.
    words.forEach((word) => {
      if (!isName(word) || !/^\p{Ll}/u.test(word.text) || isTaken(word.start, word.end)) return;
      add({ ...span(word, word), type: 'grammar', rule: 'name-capital', definite: true, title: lang === 'tl' ? 'Malaking titik sa pangalan' : 'Capital letter for a name',
        message: `"${word.text}" is a name, so it starts with a capital letter.`, example: lang === 'tl' ? 'Kalaro ko si Maria sa Maynila.' : 'Maria lives in Manila.',
        suggestions: [cap(word.text)] });
    });

    // Prefixes and suffixes (English), and Tagalog affixes and hyphens.
    if (lang === 'en') {
      words.forEach((word) => {
        if (isTaken(word.start, word.end) || isName(word)) return;
        const irregular = IRREGULAR[word.low];
        if (irregular) {
          add({ ...span(word, word), type: 'grammar', rule: 'suffix', definite: true, title: 'Word ending',
            message: `"${word.text}" is not the right form. This word changes in a special way instead of just adding an ending.`,
            example: `We say "${irregular}", not "${word.low}".`, suggestions: [keepCase(word.text, irregular)] });
          return;
        }
        const prefixed = PREFIX[word.low];
        if (prefixed) {
          add({ ...span(word, word), type: 'grammar', rule: 'prefix', definite: true, title: 'Word beginning (prefix)',
            message: `"${word.text}" uses the wrong beginning. Some words use im-, il-, ir-, in- or dis- instead of un-.`,
            example: `We say "${prefixed}".`, suggestions: [keepCase(word.text, prefixed)] });
        }
      });
      // "more bigger", "most best"
      for (let i = 0; i < words.length - 1; i++) {
        const [a, b] = [words[i], words[i + 1]];
        if ((a.low === 'more' || a.low === 'most') && (/^\p{L}+(er|est)$/u.test(b.low) && !['never', 'other', 'water', 'number', 'over', 'ever', 'interest', 'forest', 'honest', 'modest'].includes(b.low) || ['better', 'best', 'worse', 'worst'].includes(b.low)) && !isTaken(a.start, b.end)) {
          add({ ...span(a, b), type: 'grammar', rule: 'double-compare', definite: true, title: 'Double comparison',
            message: `"${b.text}" already means "${a.low}", so "${a.low}" is not needed.`, example: 'Say "bigger", not "more bigger".', suggestions: [keepCase(a.text, b.text)] });
        }
      }
    } else {
      words.forEach((word) => {
        if (isTaken(word.start, word.end) || isName(word)) return;
        // nagaral -> nag-aral: a prefix before a vowel takes a hyphen.
        const join = word.low.match(/^(nag|mag|pag|ipag|makipag|nakipag|pang|mang)([aeiou]\p{L}*)$/u);
        const info = spell[word.text] || spell[word.low];
        if (join && info && !info.tl && (info.suggest || []).some((s) => lower(s) === `${join[1]}-${join[2]}`)) {
          const fixed = keepCase(word.text, `${join[1]}-${join[2]}`);
          add({ ...span(word, word), type: 'grammar', rule: 'prefix-hyphen', definite: true, title: 'Gitling (hyphen) after the prefix',
            message: `When "${join[1]}-" comes before a word that starts with a vowel, we put a hyphen between them.`, example: 'nag-aral, mag-ingat, pag-ibig', suggestions: [fixed] });
          return;
        }
        // nag-laro -> naglaro: no hyphen before a consonant.
        const split = word.text.match(/^(nag|mag|pag|Nag|Mag|Pag)-([bcdfghklmnpqrstvwyz][\p{Ll}]+)$/u);
        if (split && !BORROWED.has(lower(split[2]))) {
          add({ ...span(word, word), type: 'grammar', rule: 'prefix-nohyphen', definite: true, title: 'No hyphen needed',
            message: `"${split[1]}-" joins a word that starts with a consonant without a hyphen.`, example: 'naglaro, magluto, pagtulong', suggestions: [`${split[1]}${split[2]}`] });
          return;
        }
        // umkain -> kumain: "um" goes inside the word, after its first consonant.
        const infix = word.low.match(/^um([bcdfghklmnpqrstvwyz])([aeiou]\p{L}*)$/u);
        if (infix && info && !info.tl) {
          const fixed = `${infix[1]}um${infix[2]}`;
          add({ ...span(word, word), type: 'grammar', rule: 'infix', definite: false, title: 'Gitlapi "-um-" (infix)',
            message: 'When a word starts with a consonant, "-um-" goes inside it, right after the first letter.', example: 'kain -> kumain, takbo -> tumakbo', suggestions: [keepCase(word.text, fixed)] });
        }
      });
      for (let i = 0; i < words.length - 1; i++) {
        const [a, b] = [words[i], words[i + 1]];
        const gap = text.slice(a.end, b.start);
        if (!/^\s+$/.test(gap)) continue;
        // pinaka maganda -> pinakamaganda
        if (['pinaka', 'napaka'].includes(a.low) && !isTaken(a.start, b.end)) {
          add({ ...span(a, b), type: 'grammar', rule: 'pinaka', definite: true, title: 'Join the prefix',
            message: `"${a.low}" is a prefix, so it is written together with the next word.`, example: 'pinakamaganda, napakabilis', suggestions: [keepCase(a.text, `${a.low}${b.low}`)] });
        }
        // rin/din, raw/daw, rito/dito, roon/doon
        const pair = { rin: 'din', din: 'rin', raw: 'daw', daw: 'raw', rito: 'dito', dito: 'rito', roon: 'doon', doon: 'roon' };
        if (pair[b.low] && !isTaken(b.start, b.end)) {
          const vowelBefore = /[aeiouwy]$/.test(a.low);
          const wanted = vowelBefore ? { din: 'rin', daw: 'raw', dito: 'rito', doon: 'roon' }[b.low] : { rin: 'din', raw: 'daw', rito: 'dito', roon: 'doon' }[b.low];
          if (wanted && !/[.,!?]/.test(gap)) {
            add({ ...span(b, b), type: 'grammar', rule: 'rin-din', definite: false, title: vowelBefore ? 'Use "r" after a vowel' : 'Use "d" after a consonant',
              message: vowelBefore ? `After a word ending in a vowel (or w/y), we usually write "${wanted}".` : `After a word ending in a consonant, we usually write "${wanted}".`,
              example: 'Siya rin, Ikaw raw, Pumunta rito / Kumain din, Galit daw', suggestions: [keepCase(b.text, wanted)] });
          }
        }
        // tumakbo ng mabilis -> tumakbo nang mabilis
        if (a.low === 'ng' && MANNER_TL.has(b.low) && a.index > 0 && !isTaken(a.start, a.end)) {
          add({ ...span(a, a), type: 'grammar', rule: 'ng-nang', definite: false, title: '"nang" or "ng"?',
            message: 'Use "nang" to tell how something is done (like "quickly"). Use "ng" before a noun (a thing).',
            example: 'Tumakbo nang mabilis. / Kumain ng mangga.', suggestions: [keepCase(a.text, 'nang')] });
        }
      }
      // "Ng umalis siya..." -> "Nang umalis siya..." (meaning "when").
      sentences.forEach((sentence) => {
        const first = sentence.words[0];
        if (first && first.low === 'ng' && sentence.words.length > 2 && !isTaken(first.start, first.end)) {
          add({ ...span(first, first), type: 'grammar', rule: 'nang-when', definite: true, title: '"Nang" at the start',
            message: 'At the start of a sentence, "nang" means "when". "Ng" is used before a noun.', example: 'Nang dumating siya, kumain kami.', suggestions: ['Nang'] });
        }
      });
    }

    // English grammar patterns.
    if (lang === 'en') {
      for (let i = 0; i < words.length - 1; i++) {
        const [a, b] = [words[i], words[i + 1]];
        const gap = text.slice(a.end, b.start);
        if (!/^\s+$/.test(gap) || isTaken(a.start, b.end) || isName(b)) continue;
        const two = `${a.low} ${b.low}`;
        let fix = null;
        if (a.low === 'a' && needsAn(b.low)) fix = ['a-an', 'Use "an"', `Use "an" before a word that starts with a vowel sound.`, 'an apple, an hour', [keepCase(a.text, 'an')], a, a];
        else if (a.low === 'an' && /^\p{L}/u.test(b.low) && !needsAn(b.low)) fix = ['a-an', 'Use "a"', `Use "a" before a word that starts with a consonant sound.`, 'a dog, a unicorn', [keepCase(a.text, 'a')], a, a];
        else if (['could', 'should', 'would', 'must', 'might'].includes(a.low) && b.low === 'of') fix = ['of-have', `"${a.low} have"`, `It sounds like "${a.low} of", but the words are "${a.low} have".`, 'I could have won.', [`${a.text} have`], a, b];
        else if (a.low === 'your' && ['welcome', 'a', 'an', 'the', 'so', 'very', 'going', 'not', 'right', 'my'].includes(b.low)) fix = ['your-youre', '"you\'re" (you are)', `"You're" means "you are". "Your" shows that something belongs to you.`, "You're my friend. / Your bag is red.", [keepCase(a.text, "you're")], a, a];
        else if (a.low === 'their' && ['is', 'are', 'was', 'were'].includes(b.low)) fix = ['their-there', 'Use "there"', '"There is / there are" uses "there". "Their" means something belongs to them.', 'There are two cats. / Their cat is black.', [keepCase(a.text, 'there')], a, a];
        else if (a.low === 'its' && ['a', 'an', 'the', 'so', 'very', 'not', 'going', 'raining', 'time', 'okay', 'ok'].includes(b.low)) fix = ['its-its', '"it\'s" (it is)', `"It's" means "it is". "Its" shows that something belongs to it.`, "It's raining. / The dog wagged its tail.", [keepCase(a.text, "it's")], a, a];
        else if (b.low === 'then' && (/\p{L}{2,}er$/u.test(a.low) && !['never', 'over', 'after', 'other', 'water', 'together', 'ever', 'later', 'under'].includes(a.low) || ['more', 'less', 'better', 'worse', 'rather'].includes(a.low))) fix = ['then-than', 'Use "than"', 'Use "than" to compare two things. "Then" is about time (what happens next).', 'bigger than a car / then we ate', ['than'], b, b];
        else if (a.low === 'to' && ['much', 'many', 'late', 'early', 'big', 'small', 'fast', 'hot', 'cold'].includes(b.low)) fix = ['to-too', 'Use "too"', '"Too" means "more than enough" or "also". "To" shows direction.', 'It is too hot. / I went to school.', [keepCase(a.text, 'too')], a, a];
        else if (['he', 'she', 'it'].includes(a.low) && b.low === "don't") fix = ['agree', 'Use "doesn\'t"', `With "${a.low}", we say "doesn't".`, "She doesn't like rain.", ["doesn't"], b, b];
        else if (['he', 'she', 'it'].includes(a.low) && b.low === 'have') fix = ['agree', 'Use "has"', `With "${a.low}", we say "has".`, 'He has a dog.', ['has'], b, b];
        else if (['they', 'we', 'you'].includes(a.low) && b.low === 'was') fix = ['agree', 'Use "were"', `With "${a.low}", we say "were".`, 'They were happy.', ['were'], b, b];
        else if (['he', 'she', 'it'].includes(a.low) && b.low === 'are') fix = ['agree', 'Use "is"', `With "${a.low}", we say "is".`, 'She is my sister.', ['is'], b, b];
        else if (a.low === 'they' && b.low === 'is') fix = ['agree', 'Use "are"', 'With "they", we say "are".', 'They are friends.', ['are'], b, b];
        else if (a.low === 'i' && ['is', 'are'].includes(b.low)) fix = ['agree', 'Use "am"', 'With "I", we say "am".', 'I am ready.', ['am'], b, b];
        if (fix) {
          const [rule, title, message, example, suggestions, from, to] = fix;
          add({ ...span(from, to), type: 'grammar', rule, definite: true, title, message, example, suggestions });
        }
      }
      words.forEach((word) => {
        if (word.text === 'i' && !isTaken(word.start, word.end)) {
          add({ ...span(word, word), type: 'grammar', rule: 'capital-i', definite: true, title: 'Capital "I"', message: 'When you talk about yourself, "I" is always a capital letter.', example: 'My friend and I played.', suggestions: ['I'] });
        }
        if (word.low === 'alot' && !isTaken(word.start, word.end)) {
          add({ ...span(word, word), type: 'spelling', rule: 'alot', definite: true, title: 'Two words', message: '"A lot" is written as two words.', example: 'I like it a lot.', suggestions: [keepCase(word.text, 'a lot')] });
        }
      });
    }

    // Repeated words: "the the" (a slip), or "araw araw" (needs a hyphen).
    for (let i = 0; i < words.length - 1; i++) {
      const [a, b] = [words[i], words[i + 1]];
      if (a.low !== b.low || !/^\s+$/.test(text.slice(a.end, b.start)) || isTaken(a.start, b.end) || isName(a)) continue;
      const functionWord = (lang === 'tl' ? TL_FUNCTION : EN_FUNCTION).has(a.low) || lang === 'en';
      if (functionWord) {
        add({ ...span(a, b), type: 'grammar', rule: 'repeat', definite: true, title: 'Repeated word', message: `"${a.text}" is written twice in a row.`, suggestions: [a.text] });
      } else {
        add({ ...span(a, b), type: 'grammar', rule: 'reduplicate', definite: true, title: 'Gitling (hyphen) in repeated words',
          message: 'When a whole word is repeated, a hyphen joins the two.', example: 'araw-araw, bahay-bahay, isa-isa', suggestions: [`${a.text}-${b.low}`] });
      }
    }

    // Spelling and the other language (from the dictionaries).
    let otherWords = 0;
    let checkedWords = 0;
    words.forEach((word) => {
      const info = spell[word.text] || spell[word.low];
      if (!info || word.low.length < 2 || /\d/.test(word.text)) return;
      checkedWords++;
      if (isTaken(word.start, word.end)) return;
      if (isName(word)) return;
      const inLang = info[lang];
      const inOther = info[other];
      const englishTranslation = lang === 'tl' ? EN_TL[word.low] : null;
      const looksOther = lang === 'tl'
        ? (inOther && (!inLang || englishTranslation) && !BORROWED.has(word.low))
        : (inOther && !inLang);
      if (looksOther) {
        otherWords++;
        const suggestion = lang === 'tl' ? englishTranslation : TL_EN[word.low];
        add({ ...span(word, word), type: 'mismatch', rule: 'language', definite: false,
          title: lang === 'tl' ? 'English word in Tagalog writing' : 'Tagalog word in English writing',
          message: lang === 'tl'
            ? `"${word.text}" is English. This notepad is for practising Tagalog, so try the Tagalog word. (Mixing a few English words is common when we talk, and names or words like "computer" are fine.)`
            : `"${word.text}" is Tagalog. This notepad is for practising English, so try the English word.`,
          suggestions: suggestion ? [keepCase(word.text, suggestion)] : [], lookup: { word: word.low, from: other } });
        return;
      }
      if (inLang) return;
      if (lang === 'tl' && inOther) return;   // an accepted borrowed word
      const suggestions = (info.suggest || []).filter((s) => s && lower(s) !== word.low).slice(0, 4).map((s) => keepCase(word.text, s));
      // Tagalog words take many forms the dictionary may not list: only a word
      // with a close match is pointed out.
      if (lang === 'tl' && !suggestions.length) return;
      // A capitalized word at the start of a sentence that neither dictionary
      // knows may be a name (Bimbo went home): only a gentle check.
      if (word.first && /^\p{Lu}/u.test(word.text) && !inOther) {
        add({ ...span(word, word), type: 'spelling', rule: 'spelling', definite: false, title: 'Check this word',
          message: `"${word.text}" is not in the dictionary. If it is a name, it is fine as it is. If not, check its spelling.`, suggestions });
        return;
      }
      add({ ...span(word, word), type: 'spelling', rule: 'spelling', definite: suggestions.length > 0, title: suggestions.length ? 'Spelling' : 'Check this word',
        message: suggestions.length ? `"${word.text}" may be misspelled.` : `"${word.text}" is not in the dictionary. Check its spelling, or ignore this if it is a name or a special word.`,
        suggestions });
    });

    // Capital letters and end marks.
    sentences.forEach((sentence) => {
      const first = sentence.words[0];
      // After a quote ("Look!" my sister said) the sentence carries on.
      const afterQuote = /[!?,]["”'’]\s*$/.test(text.slice(Math.max(0, sentence.start - 4), sentence.start));
      if (first && !afterQuote && /^\p{Ll}/u.test(first.text) && first.start === sentence.start && !isTaken(first.start, first.end)) {
        add({ ...span(first, first), type: 'grammar', rule: 'capital', definite: true, title: lang === 'tl' ? 'Malaking titik (capital letter)' : 'Capital letter',
          message: 'A sentence starts with a capital letter.', example: lang === 'tl' ? 'Kumain kami ng almusal.' : 'We ate breakfast.', suggestions: [cap(first.text)] });
      }
    });
    // A question ends with a question mark: a sentence that asks something
    // but ends with "." or "!" (or nothing) is a mistake to fix.
    sentences.forEach((sentence) => {
      if (sentence.words.length < 2 || !isQuestion(sentence, lang)) return;
      const tail = sentence.text.match(/([.!?…]+)(["'”’)\]]*)$/);
      if (tail && tail[1].includes('?')) return;
      const message = lang === 'tl'
        ? 'This sentence asks a question, so it ends with a question mark (?), not a period.'
        : 'This sentence asks a question, so it ends with a question mark (?), not a period.';
      const example = lang === 'tl' ? 'Ano ang ginagawa mo? / Kumain ka na ba?' : 'What are you doing? / Do you like cats?';
      const title = lang === 'tl' ? 'Tandang pananong (question mark)' : 'Question mark';
      if (tail) {
        // The last word and its end mark, so the mark is easy to tap; the end
        // mark becomes "?" (any closing quote stays).
        const at = sentence.end - tail[0].length;
        const last = sentence.words[sentence.words.length - 1];
        const from = last && last.end <= at && !isTaken(last.start, last.end) ? last.start : at;
        add({ start: from, end: at + tail[1].length, type: 'grammar', rule: 'question-mark', definite: true, title, message, example, suggestions: [`${text.slice(from, at)}?`] });
      } else {
        const end = sentence.words[sentence.words.length - 1];
        if (isTaken(end.start, end.end)) return;
        add({ start: end.start, end: end.end, type: 'grammar', rule: 'question-mark', definite: true, title, message, example, suggestions: [`${end.text}?`] });
      }
    });
    paragraphs.forEach((paragraph) => {
      const last = paragraph.sentences[paragraph.sentences.length - 1];
      if (!last || last.ended || last.words.length < 4) return;
      const end = last.words[last.words.length - 1];
      if (isTaken(end.start, end.end)) return;
      if (/\p{Extended_Pictographic}/u.test(text.slice(end.end, last.end))) return;
      add({ start: end.start, end: end.end, type: 'grammar', rule: 'end-mark', definite: true, title: lang === 'tl' ? 'Bantas sa dulo' : 'End mark',
        message: 'A sentence ends with a period (.), a question mark (?) or an exclamation point (!).', suggestions: [`${end.text}.`] });
    });
    for (const match of text.matchAll(/ +([,.!?;:])/g)) {
      add({ start: match.index, end: match.index + match[0].length, type: 'grammar', rule: 'space-before', definite: true, title: 'Extra space',
        message: 'There is no space before a comma or an end mark.', suggestions: [match[1]] });
    }
    for (const match of text.matchAll(/([,;:!?]|\.(?!\.))(\p{L}{2,})/gu)) {
      const before = text.slice(Math.max(0, match.index - 3), match.index);
      if (/\.\p{L}$/u.test(before) || /\d$/.test(before)) continue;
      add({ start: match.index, end: match.index + match[0].length, type: 'grammar', rule: 'space-after', definite: true, title: 'Missing space',
        message: 'Put a space after a comma or an end mark.', suggestions: [`${match[1]} ${match[2]}`] });
    }

    // Organization and flow.
    const longLimit = lang === 'tl' ? 32 : 30;
    sentences.forEach((sentence, index) => {
      const n = sentence.words.length;
      const connectors = sentence.words.filter((word) => CONNECTORS[lang].has(word.low)).length;
      if (n > longLimit || (connectors >= 4 && n > 18)) {
        add({ start: sentence.start, end: sentence.end, type: 'organization', rule: 'long-sentence', definite: false, title: 'Long sentence',
          message: connectors >= 4
            ? `This sentence joins many ideas with "${lang === 'tl' ? 'at / tapos' : 'and / then'}". Try ending it sooner and starting a new sentence.`
            : 'This sentence is long, so it may be hard to follow. Try splitting it into two or three shorter sentences.',
          example: lang === 'tl' ? 'Pumunta kami sa parke. Pagkatapos, naglaro kami.' : 'We went to the park. Then we played.', suggestions: [] });
      }
      if (index >= 2) {
        const starts = [sentences[index - 2], sentences[index - 1], sentence].map((s) => s.words[0] && s.words[0].low);
        if (starts[0] && starts.every((s) => s === starts[0]) && !['i', 'ako'].includes(starts[0])) {
          const first = sentence.words[0];
          add({ start: first.start, end: first.end, type: 'organization', rule: 'same-start', definite: false, title: 'Same start again',
            message: `Three sentences in a row start with "${first.text}". Starting sentences in different ways makes your writing flow better.`,
            example: lang === 'tl' ? 'Pagkatapos, ... / Saka ... / Nang matapos, ...' : 'Next, ... / After that, ... / Finally, ...', suggestions: [] });
        }
      }
    });
    paragraphs.forEach((paragraph) => {
      if (paragraph.sentences.length > 8) {
        const first = paragraph.sentences[0];
        add({ start: first.start, end: first.end, type: 'organization', rule: 'long-paragraph', definite: false, title: 'Long paragraph',
          message: 'This paragraph has many sentences. Start a new paragraph when you move to a new idea, place or time.', suggestions: [] });
      }
    });
    if (paragraphs.length === 1 && words.length > 120 && sentences.length > 6) {
      const first = sentences[0];
      add({ start: first.start, end: first.end, type: 'organization', rule: 'no-paragraphs', definite: false, title: 'Add paragraphs',
        message: 'Your writing is all one block. Breaking it into paragraphs (beginning, middle, end) helps readers follow your ideas.', suggestions: [] });
    }
    for (const match of text.matchAll(/[!?]{3,}/g)) {
      add({ start: match.index, end: match.index + match[0].length, type: 'organization', rule: 'many-marks', definite: false, title: 'Many marks',
        message: 'One exclamation point or question mark is enough. Your words can show the feeling.', suggestions: [match[0][0]] });
    }

    // Vocabulary and creativity ideas (optional).
    if (lang === 'en') {
      for (let i = 0; i < words.length - 1; i++) {
        const [a, b] = [words[i], words[i + 1]];
        if (a.low === 'very' && VERY[b.low] && /^\s+$/.test(text.slice(a.end, b.start)) && !isTaken(a.start, b.end)) {
          add({ ...span(a, b), type: 'vocabulary', rule: 'very', definite: false, title: 'A stronger word',
            message: `Instead of "very ${b.low}", one strong word can paint a clearer picture.`, example: `very ${b.low} -> ${VERY[b.low]}`, suggestions: [keepCase(a.text, VERY[b.low])] });
        }
      }
    } else {
      for (let i = 0; i < words.length - 1; i++) {
        const [a, b] = [words[i], words[i + 1]];
        if (a.low === 'sobrang' && /^ma\p{L}+/u.test(b.low) && !isTaken(a.start, b.end)) {
          add({ ...span(a, b), type: 'vocabulary', rule: 'sobrang', definite: false, title: 'Another way to say it',
            message: `"Sobrang ${b.low}" is fine when talking. In writing, "napaka-" can sound richer.`, example: 'sobrang ganda -> napakaganda', suggestions: [keepCase(a.text, `napaka${b.low.replace(/^ma/, '')}`)] });
        }
      }
    }
    const counts = {};
    words.forEach((word) => { counts[word.low] = (counts[word.low] || 0) + 1; });
    const seen = {};
    words.forEach((word) => {
      const ideas = OVERUSED[lang][word.low];
      if (!ideas || counts[word.low] < 3) return;
      seen[word.low] = (seen[word.low] || 0) + 1;
      if (seen[word.low] < 2 || isTaken(word.start, word.end) || isName(word)) return;
      add({ ...span(word, word), type: 'vocabulary', rule: 'overused', definite: false, title: 'Try a different word',
        message: `You used "${word.low}" ${counts[word.low]} times. A different word here can make your writing more interesting.`, suggestions: ideas.map((idea) => keepCase(word.text, idea)) });
    });

    // Emojis: a few are fine; many make writing harder to read.
    const emojiTotal = emojis.reduce((sum, item) => sum + item.count, 0);
    const tooMany = emojiTotal >= 4 || (words.length && emojiTotal / words.length > 0.1) || emojis.some((item) => item.count >= 3);
    if (tooMany) {
      let shown = 0;
      emojis.forEach((item) => {
        shown += item.count;
        if (shown <= 2 && item.count < 3) return;
        add({ start: item.start, end: item.end, type: 'emoji', rule: 'emoji', definite: false, title: 'Lots of emojis',
          message: 'Emojis are fun in chats, but many of them make a story harder to read. Try showing the feeling with words, and keep one emoji where it really helps.',
          example: '"I was so happy 😀😀😀" -> "I was so happy I jumped up and down!"', suggestions: [''] });
      });
    }

    // Ignored by the student; ordered by place.
    const ignored = new Set(options.ignored || []);
    const kept = issues.filter((issue) => !ignored.has(issue.key)).sort((a, b) => a.start - b.start || a.end - b.end);
    kept.forEach((issue, index) => { issue.id = `b${index}`; issue.source = 'built-in'; });
    const stats = statsOf(text, doc, emojiTotal);
    stats.otherShare = checkedWords ? otherWords / checkedWords : 0;
    return { issues: kept, stats, doc };
  }

  function statsOf(text, doc, emojiTotal) {
    const { words, sentences, paragraphs } = doc;
    const unique = new Set(words.map((word) => word.low)).size;
    const lengths = sentences.map((sentence) => sentence.words.length).filter(Boolean);
    const average = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
    const spread = lengths.length > 1 ? Math.sqrt(lengths.reduce((sum, n) => sum + (n - average) ** 2, 0) / lengths.length) : 0;
    return {
      words: words.length, sentences: sentences.length, paragraphs: paragraphs.length, characters: text.length,
      unique, variety: words.length ? unique / words.length : 0, averageSentence: average, sentenceSpread: spread, emojis: emojiTotal,
      dialogue: /["“”][^"“”]{3,}["“”]/.test(text)
    };
  }

  // --- End-of-challenge feedback ---------------------------------------------------------------------------
  const TYPE_NAMES = {
    spelling: 'Spelling and word choice', grammar: 'Grammar, prefixes and suffixes', organization: 'Organization and flow',
    vocabulary: 'Vocabulary and creativity', mismatch: 'Language choice', emoji: 'Emoji use'
  };
  const DESCRIBING = new Set(('bright dark soft loud quiet gentle huge tiny giant colorful sparkling shiny golden silver cold warm fresh delicious sweet sour '
    + 'brave kind gentle fierce clever curious mysterious ancient enormous magical peaceful noisy smooth rough fluffy wet dry glowing '
    + 'makulay maliwanag madilim malambot tahimik maingay malamig mainit matamis maasim matapang mabait marikit makintab mahiwaga '
    + 'malawak malalim maganda masarap mabango malinis').split(' '));

  function feedback(text, lang, result, extra = {}) {
    const { issues, stats, doc } = result;
    const definite = issues.filter((issue) => issue.definite);
    const byType = {};
    issues.forEach((issue) => { (byType[issue.type] = byType[issue.type] || []).push(issue); });
    const strengths = [];
    if (stats.words >= 80) strengths.push(`You wrote ${stats.words} words - that is a strong amount of writing!`);
    else if (stats.words >= 30) strengths.push(`You wrote ${stats.words} words and shared your ideas clearly.`);
    if (stats.words >= 25 && stats.variety >= 0.6) strengths.push('You used many different words instead of repeating the same ones.');
    const notAdverbs = new Set(['family', 'only', 'early', 'reply', 'belly', 'jelly', 'holy', 'ugly', 'july', 'butterfly', 'supply', 'italy', 'lily', 'sally', 'silly', 'friendly', 'lovely', 'lonely', 'likely']);
    const describing = Array.from(new Set(doc.words.filter((word) => DESCRIBING.has(word.low) || (lang === 'en' && /\p{L}{4,}ly$/u.test(word.low) && !notAdverbs.has(word.low))).map((word) => word.low))).slice(0, 4);
    if (describing.length >= 2) strengths.push(`You used describing words like ${describing.map((w) => `"${w}"`).join(', ')}.`);
    if (stats.sentences >= 3 && stats.sentenceSpread >= 3.5) strengths.push('You mixed short and long sentences, which makes your writing more interesting to read.');
    const spelling = (byType.spelling || []).filter((issue) => issue.rule !== 'rude').length;
    if (stats.words >= 15 && spelling === 0) strengths.push('No spelling mistakes were found - great job!');
    else if (stats.words >= 40 && spelling <= 2) strengths.push('You spelled almost every word correctly.');
    if (stats.paragraphs >= 2) strengths.push('You organized your writing into paragraphs.');
    if (stats.dialogue) strengths.push('You used dialogue, which brings your characters to life.');
    if (stats.words >= 15 && stats.otherShare < 0.05) strengths.push(lang === 'tl' ? 'You stayed in Tagalog the whole time - mahusay!' : 'You stayed in English the whole time.');
    if (!(byType.grammar || []).length && stats.sentences >= 3) strengths.push('Your sentences follow the grammar rules we checked.');
    if (!strengths.length) strengths.push('You put your ideas into words - that is how every great writer starts!');

    const advice = [];
    if ((byType.spelling || []).length) advice.push('Read your writing slowly, one word at a time, to catch spelling slips. Say tricky words out loud and listen to each sound.');
    if ((byType.grammar || []).length) advice.push(lang === 'tl' ? 'Check the small words like "ng/nang", "rin/din" and the hyphens in words like "nag-aral". They make a big difference.' : 'Check that each sentence starts with a capital letter and ends with a period, question mark or exclamation point.');
    if ((byType.organization || []).length) advice.push('Plan before you write: a beginning, a middle and an end. Start a new paragraph for each new idea.');
    if ((byType.vocabulary || []).length || stats.variety < 0.5) advice.push('Use your five senses: what did you see, hear, smell, taste or feel? Describing them makes your writing come alive.');
    if ((byType.mismatch || []).length) advice.push(lang === 'tl' ? 'When you do not know a Tagalog word, look it up in the Dictionary and add it to your writing.' : 'When you do not know an English word, look it up in the Dictionary.');
    if ((byType.emoji || []).length) advice.push('Show feelings with words instead of many emojis: "My heart was pounding" says more than 😱😱😱.');
    if (stats.words < 30) advice.push('Next time, try to write a few more sentences. Add details: who, what, where, when and why.');
    if (advice.length < 2) advice.push('Read your work out loud when you finish. If something sounds strange, try saying it another way.');

    // Some sentences with their definite corrections made.
    const improved = [];
    doc.sentences.forEach((sentence) => {
      if (improved.length >= 3) return;
      const inside = definite.filter((issue) => issue.start >= sentence.start && issue.end <= sentence.end && issue.suggestions && issue.suggestions.length).sort((a, b) => b.start - a.start);
      if (!inside.length) return;
      let fixed = sentence.text;
      inside.forEach((issue) => {
        const from = issue.start - sentence.start;
        fixed = fixed.slice(0, from) + issue.suggestions[0] + fixed.slice(issue.end - sentence.start);
      });
      if (fixed !== sentence.text) improved.push({ original: sentence.text, suggestion: fixed });
    });

    const corrections = Object.keys(TYPE_NAMES).filter((type) => byType[type]).map((type) => ({
      type, name: TYPE_NAMES[type],
      items: byType[type].slice(0, 12).map((issue) => ({
        text: text.slice(issue.start, issue.end), title: issue.title, message: issue.message, example: issue.example || '',
        suggestion: (issue.suggestions || [])[0] ?? '', definite: issue.definite
      }))
    }));
    const minutes = extra.seconds ? extra.seconds / 60 : 0;
    return {
      lang, strengths: strengths.slice(0, 5), corrections, advice: advice.slice(0, 4), improved,
      emoji: (byType.emoji || []).length ? 'You used a lot of emojis. In stories and school writing, choose words to show feelings, and keep an emoji only where it really adds something.' : '',
      stats: {
        words: stats.words, sentences: stats.sentences, paragraphs: stats.paragraphs, unique: stats.unique,
        averageSentence: Math.round(stats.averageSentence * 10) / 10, corrections: definite.length, ideas: issues.length - definite.length,
        minutes: minutes ? Math.round(minutes * 10) / 10 : null, wordsPerMinute: minutes ? Math.round(stats.words / minutes) : null
      },
      at: Date.now()
    };
  }

  window.KoobdWritingChecker = { check, feedback, read, TYPE_NAMES };
})();
