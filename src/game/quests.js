import { ITEMS } from './items.js';

// Small errands the villagers ask of you. Most are fetch-and-carry; the reward
// is usually money, sometimes an item, and quite often just knowing where to
// buy something you couldn't find before.

export const QUESTS = [
  {
    id: 'first_beans',
    giver: 'pip',
    title: 'Something To Sell',
    desc: 'Pip suggested stocking coffee and something sweet before opening properly.',
    objective: { type: 'stock', any: ['house_coffee', 'black_tea'], count: 6 },
    reward: { money: 60, items: [['cookie', 4]] },
    offer: "You've opened a cafe with nothing to sell in it. Bold.\n\nGet six portions of coffee or tea in and I'll throw in some biscuits for nothing.",
    progress: "Stock six portions of coffee or tea. Buy them from the grocer in Brambleford.",
    complete: "There we are. Now you're a business.\n\nTake these biscuits. Don't tell anyone I'm soft.",
  },
  {
    id: 'honey_run',
    giver: 'dough',
    title: 'A Jar of Sunlight',
    desc: "Dough wants a jar of Clover's honey from Oakhollow to work into a scone recipe.",
    objective: { type: 'item', item: 'honey', count: 1 },
    reward: { money: 140, flags: ['recipe_honey'], items: [['honey_scone', 3]] },
    offer: "Right. Clover keeps bees out at Oakhollow, east through the woods.\n\nBring me one jar and I'll teach you the honey scone. People will walk an hour for it.",
    progress: 'Buy a jar of honey from the beekeeper in Oakhollow. Follow the road east and then '
      + 'north, and look for the very large tree.',
    complete: "That's the stuff. Right — honey scones. Your menu just got interesting.\n\nBuy the honey, bake the scone, watch them queue.",
  },
  {
    id: 'lost_bell',
    giver: 'marigold',
    title: 'The Lost Bell',
    desc: 'A little bell with a name scratched inside was found on the road. Marigold thinks it belongs to somebody in Saltmere.',
    objective: { type: 'deliver', item: 'lost_bell', to: 'shrimp' },
    reward: { money: 180, friendship: ['shrimp'], items: [['bell', 1]] },
    offer: "Somebody handed this in. There's a name scratched inside — can't read it, but it's a Saltmere sort of name.\n\nTake it down to the coast and ask around? Start with the otter on the shingle.",
    progress: 'Take the bell to Shrimp in Saltmere, on the coast to the south-west. He is the '
      + 'otter by the water.',
    complete: 'Thank you for bringing it back. Really.',
  },
  {
    id: 'flower_delivery',
    giver: 'nettle',
    title: 'Flowers for Somebody',
    desc: 'Nettle picked wildflowers for someone in Hollowdown but is too shy to deliver them.',
    objective: { type: 'deliver', item: 'wildflowers', to: 'chalk' },
    reward: { money: 90, friendship: ['chalk', 'nettle'], hint: 'taxi' },
    offer: "Right. This is embarrassing. I picked these for someone up in Hollowdown and now I can't possibly hand them over myself.\n\nWould you? Chalk. The squirrel. You'll know them.",
    progress: 'Take the flowers to Chalk in Hollowdown, up on the chalk hills to the north.',
    complete: "Oh. Oh! From Nettle? Well. Well well well.\n\nHere, take this — you'll want to know the birds run a taxi service. Perch in every town.",
  },
  {
    id: 'sea_shell',
    giver: 'juniper',
    title: 'Something for the Window',
    desc: 'Juniper thinks your cafe needs a spiral shell on the windowsill.',
    objective: { type: 'item', item: 'seashell', count: 1 },
    reward: { money: 110, items: [['f_plant', 1]], rep: 0.04 },
    offer: "Your place needs a *thing*. An object. Something with a story.\n\n"
      + "A big spiral shell, that's what. There was one down at Saltmere — I'd ask about "
      + "rather than go looking, mind. That beach has been picked over since before I was born.",
    // Asking around *is* the job until somebody answers. Shrimp is the one who
    // knows, and once he has said so the note has to say where the shell went —
    // it is a whole errand away by then, and nobody remembers a line of
    // dialogue from two towns ago.
    progress: (st) => (st.flags.heard_hint_shrimp
      ? 'Shrimp says Moth has the shell. Moth is a small grey mouse in Brambleford, '
        + 'out after dark counting moths on the lamps. Go and see what he wants for it.'
      : 'Ask around Saltmere about a big spiral shell. Somebody down there had one.'),
    complete: "Perfect. Absolutely perfect.\n\nHere, have this fern too. Trust me on the fern.",
  },
  {
    id: 'clear_the_path',
    giver: 'brook',
    title: 'The Fallen Chalk',
    desc: 'A slab of chalk is blocking the river bridge on the road east. Brook says the right tool would shift it.',
    objective: { type: 'flag', flag: 'barrier_eastpass' },
    reward: { money: 260, rep: 0.05 },
    offer: "Water's high after the rain, and it took the bank out from under a chalk face "
      + "east of here. Great lump of it came down right across the middle of the bridge, and it "
      + "is deep water either side.\n\n"
      + "That was the road to Thistlewick, that was. You can still get there the long way round, "
      + "by Hollowdown and Oakhollow, but it is the best part of an hour nobody should have to "
      + "walk twice.\n\n"
      + "Get a pick — the Chalk Pit Store up in Hollowdown has them — and shift it. Everyone in "
      + "this town will be quietly grateful and not one of them will say so.",
    progress: 'Buy a chalk pick at the Chalk Pit Store in Hollowdown, then follow the road due '
      + 'east out of town to the river. You cannot miss the bridge, or the chalk sitting on it.',
    complete: "You shifted it? On your own?\n\nRight. That is the bridge open again, and the "
      + "road east with it — no more trailing all the way round by Hollowdown to get to "
      + "Thistlewick.\n\nTake this, and don't argue.",
  },
  {
    id: 'bramble_path',
    giver: 'grist',
    title: 'The Way to the Mill',
    desc: 'Brambles have swallowed the path to the old mill. Grist would like it opened.',
    objective: { type: 'flag', flag: 'barrier_millpath' },
    reward: { money: 220, items: [['valley_map', 1]] },
    offer: "The old mill's my family's, technically. Can't reach it — the brambles have taken "
      + "the whole bridge across to it. Grown right over the deck, thick as rope.\n\n"
      + "Shears would do it. The hardware place up in Hollowdown sells them.",
    progress: 'Buy hedge shears at the Chalk Pit Store in Hollowdown, then go to the little '
      + 'bridge on the mill track, north-east of here.',
    complete: "You got through! And you didn't fall through the floor. Both good.\n\nHere. Map of the valley. It's wrong about the north but it's better than nothing.",
  },
  {
    id: 'four_cats',
    giver: 'thimble',
    title: 'A Proper Cattery',
    desc: 'Thimble counts your cats every time they walk past and would like there to be more of them.',
    objective: { type: 'cats', count: 4 },
    reward: { money: 200, rep: 0.06 },
    offer: "I count your cats when I walk past. There are not enough of them.\n\nGet to four and I'll... I'll be pleased. And I'll give you something. For the trouble.",
    progress: 'Adopt four cats. Whisker & Paw down the lane sells them.',
    complete: "Four! I counted twice.\n\nHere. Spend it on something for them, not for you.",
  },
  {
    id: 'good_coat',
    giver: 'suds',
    title: 'Show Me a Silky Coat',
    desc: 'Suds wants to see what proper food does to a cat, not just grooming.',
    objective: { type: 'coat', quality: 1.12 },
    reward: { money: 240, items: [['brush', 1]], hint: 'fish' },
    offer: "Everyone thinks grooming is the whole story. It isn't. Food's half of it.\n\nFeed your cats fish or the gourmet tins for a few days — the cheap stuff will not show — and bring one back to me.",
    progress: 'Feed a cat fresh fish or gourmet tins for a few days running. Kibble and good food will not do it.',
    complete: "*Now* look at that. That's what I'm talking about.\n\nTake a brush — do them between visits. And go and see Kelp in Saltmere about fish. Before noon, mind.",
  },
  {
    id: 'first_extension',
    giver: 'trowel',
    title: 'Room to Breathe',
    desc: "Trowel will believe you're serious once you've actually built something.",
    objective: { type: 'rooms', count: 2 },
    reward: { money: 300, rep: 0.08 },
    offer: "Everyone talks about extending. Almost nobody does it.\n\nHire a hand, buy the timber, put up one more room. Then come back and we'll talk about doing it properly.",
    progress: 'Hire workers from me, then build one more room onto the cafe.',
    complete: "You did it. And it's not bad.\n\nRight. Now you're a customer. Next time we'll do something ambitious.",
  },
  {
    id: 'busy_day',
    giver: 'ledger',
    title: 'A Day Worth Having',
    desc: 'Ledger would like to see you turn a genuinely good profit in a single day.',
    objective: { type: 'profit', amount: 400 },
    reward: { money: 350, rep: 0.1 },
    offer: "Advice is cheap. Results aren't.\n\nClear four hundred profit in one day — after wages, after cat food, after everything. Then I'll take you seriously.",
    progress: 'Clear four hundred in profit in a single day, after all your costs.',
    complete: "Four hundred clear. On a Tuesday, no less.\n\nYou've got a business. Congratulations. Now don't get comfortable.",
  },
  {
    id: 'rare_cat',
    giver: 'sable',
    title: 'A Cat of Distinction',
    desc: 'Sable will only take you seriously once you own a rare breed.',
    objective: { type: 'rarecat' },
    reward: { money: 400, items: [['ribbon', 2]], rep: 0.08 },
    offer: "Common cats are lovely and I mean nothing against them.\n\nBut bring a rare coat into that room and watch what happens to your takings. Come back when you've one of mine.",
    progress: 'Adopt a rare breed. I sell them here, on the days I open.',
    complete: "There. Now your cafe has a *centrepiece*.\n\nTake these ribbons. Presentation is most of it.",
  },
  {
    id: 'lighthouse_log',
    giver: 'slate',
    title: 'The Keeper Who Left',
    desc: "Slate wants to know what's in the lighthouse logbook.",
    objective: { type: 'item', item: 'logbook', count: 1 },
    reward: { money: 300, items: [['lantern', 1]], rep: 0.05 },
    offer: "Gullrock Light. Still burning, no keeper. Nobody will go and look.\n\nThere's a logbook in there. Bring it to me and I'll make it worth the walk.",
    progress: "Search the keeper's table in the lighthouse, west along the coast past Saltmere.",
    complete: "Eleven years of tides and weather... and one line, near the end.\n\n'The cat has stopped coming. I shall wait a while longer.'\n\nHm. Take this lantern. Somebody should keep something burning.",
  },
  {
    id: 'lane_end_hedge',
    giver: 'button',
    title: 'The Hedge at Lane End',
    desc: "Button's hedge moves at night. Button would like it to stop.",
    offer: "Right. Short legs, long opinions, and here is one of them.\n\n"
      + "The hedge at the end of my lane MOVES. At night. Not the wind — one bit of it, "
      + "going up and down like something is working along the bottom of it looking for a sock.\n\n"
      + "I have barked at it. I have barked at it a great deal. It does not care, which is "
      + "frankly insulting. You have cats. You are used to nonsense. Would you go and look?",
    complete: 'Oh. Oh, that IS mine. That is my collar.\n\n'
      + '*the very old dog stands still for the first time in two hundred years*\n\n'
      + 'They put my name on it, you know. At the opening. There was a ribbon and everything.\n\n'
      + 'Thank you. Thank you. I shall stop bothering the hedge.',
    steps: [
      {
        objective: { type: 'flag', flag: 'saw_the_hedge' },
        evidence: 'saw_the_hedge',
        note: 'Look at the hedge at the end of the lane, after dark',
        progress: 'Go and look at the hedge after dark. It does nothing in daylight — I have '
          + 'stood there checking, repeatedly.',
        done: 'You SAW it? Ha! HA! I am not daft, then. Right. What do we do about it?',
      },
      {
        objective: { type: 'talk', to: 'woofers' },
        note: 'Speak to whatever is in the hedge',
        progress: 'Go back to the hedge after dark and talk to whatever is in it. It will not '
          + 'be me who does it.',
        done: '*the shape in the hedge lifts its head*\n\n'
          + 'You can see me. Nobody has been able to see me in a very long while.\n\n'
          + 'I have lost my collar. It was gold, and it had my name upon it, and I have been '
          + 'looking in this hedge for — some time. I no longer recall where I had it last.\n\n'
          + 'I do not recall a great deal. I am fairly sure I was IMPORTANT.',
      },
      {
        objective: { type: 'flag', flag: 'read_town_history' },
        evidence: 'read_town_history',
        note: 'Read about Sir Woofers at the Reading Room in Brambleford',
        progress: 'Read the town history at the Reading Room in Brambleford. Somebody will have '
          + 'written a dead dog down — somebody writes everything down.',
        done: 'Saltsouth Pier. 1800. He wore it to the opening and never came home with it.\n\n'
          + 'And Saltsouth, according to the margin, is Saltmere.',
      },
      {
        // The collar is consumed by the very next step, so "are you holding it"
        // stops being true the moment you hand it over — and then nothing in
        // the save says you ever did. Without the flag to point at, a player
        // who got this far could not be moved on or moved back.
        objective: { type: 'item', item: 'golden_collar' },
        evidence: 'got_collar',
        note: 'Search the mud at the end of Saltmere Pier',
        progress: 'Go to the end of the pier at Saltmere and search the mud under it, not on it.',
        done: 'Two hundred years in the mud, and still bright.',
      },
      {
        objective: { type: 'deliver', item: 'golden_collar', to: 'woofers', give: false },
        note: 'Take the collar back to Sir Woofers, after dark',
        progress: 'Take the collar back to the hedge after dark. He is always at the hedge.',
      },
    ],
    reward: { money: 340, rep: 0.1, friendship: ['button'], items: [['catnip', 2]] },
  },
  {
    id: 'moth_count',
    giver: 'moth',
    night: true,
    // Moth will not raise this until Shrimp has said where the shell went —
    // otherwise the shell errand sends you to a beach that has not had one on
    // it in years.
    needsHint: 'shrimp',
    title: 'Fourteen Species',
    desc: 'Moth counts moths, and has run out of light to count them by.',
    offer: "You're up late. Good. Nobody's ever awake this late.\n\n"
      + "I count them, you see. On the lamps. Only the lamps in this town are dreadful and "
      + "half of them are out, and I'm fairly sure I've been counting the same moth eleven times.\n\n"
      + "There's a proper storm lantern to be had at the hardware place up in Hollowdown. "
      + "Bring me one and I'll show you something.",
    complete: '*Moth holds the lantern up and the air fills — properly fills — with wings*\n\n'
      + "Fourteen. Fourteen species on one lamp. And there's the one I've never got a name for.\n\n"
      + "Take this. Found it under the lamp at the crossroads, and it's no use to me.",
    steps: [
      {
        objective: { type: 'item', item: 'lantern' },
        note: 'Buy a storm lantern at the Chalk Pit Store in Hollowdown',
        progress: 'Buy a storm lantern at the Chalk Pit Store in Hollowdown. Ask for a storm '
          + 'lantern, not a nice one.',
        done: "That's the one. Now — where's dark and still and has a lamp?",
      },
      {
        objective: { type: 'deliver', item: 'lantern', to: 'moth', give: false },
        note: 'Take the lantern to Moth, after dark',
      },
    ],
    reward: { money: 150, items: [['seashell', 1]], friendship: ['moth'] },
  },
  {
    id: 'the_telephone',
    giver: 'hollis',
    title: 'A Line Out',
    desc: 'Hollis at the inn thinks a cafe your size ought to have a telephone.',
    offer: "I have been watching your place fill up! You are past being a nice little spot, "
      + "you are a business.\n\n"
      + "Have you thought about doing deliveries? You'll need a telephone.\n\n"
      + "The phone company is in Hollowdown and they'll need to be paid to set up an account. "
      + "If you do that, I'll give you my old phone I've got sitting in the cellar.",
    complete: "*Hollis blows the dust off a bakelite telephone and sets it on the bar*\n\n"
      + "Put it where you can hear it from the pantry. It will ring a few times a day and it "
      + "will only ring when you are busy — that is the nature of the thing.\n\n"
      + "Take the order, deliver it before too long, and get paid for the walk as well as the food.",
    steps: [
      {
        objective: { type: 'seatsEver', count: 40 },
        note: 'Get the cafe up to 40 seats',
        progress: 'Get the cafe up to forty seats. Build the rooms first, then fill them — '
          + 'sofas and benches count for three each.',
        done: 'Show me a day that fills forty seats at your cafe.',
      },
      {
        objective: { type: 'gross', amount: 1000 },
        note: 'Take 1000 in a single day',
        progress: 'Take a thousand in one day, before costs. The morning card keeps the record.',
        done: "That'll do. Now go and pay the phone company in Hollowdown, ask for a new line.",
      },
      {
        objective: { type: 'money', amount: 600 },
        note: 'Save up 600 to pay the phone company',
        progress: 'Save up six hundred for the phone company. They do not do favours and '
          + 'neither do I.',
        done: 'Good. Come and see me and we will get you connected.',
      },
      {
        objective: { type: 'talk', to: 'hollis' },
        note: 'See Hollis at the Sleeping Hare',
        progress: 'Come and see me at the Sleeping Hare in Brambleford. I am behind the bar, as ever.',
      },
    ],
    reward: { money: -600, items: [['f_telephone', 1]], rep: 0.1, friendship: ['hollis'] },
  },
  {
    id: 'the_usual',
    giver: 'fennel',
    title: 'The Usual',
    desc: 'Fennel would like his usual. You do not stock his usual and he is in no hurry about it.',
    offer: "Afternoon. I'll have the usual.\n\n"
      + "...Ah. You don't do the usual. That's all right. Nobody does the usual any more.\n\n"
      + "Dandelion cordial. Root & Remedy in Oakhollow make it, in small batches, badly "
      + "advertised. Get some in and I shall become the most reliable income you have ever had.\n\n"
      + "No, I won't fetch it myself. I have thought about it. At length.",
    complete: "*Fennel takes one sip and closes his eyes for slightly too long*\n\n"
      + "That's it. That is precisely it.\n\nRight. Same time most days, then. You'll get used to me.\n\n"
      + "Here — my aunt left me this and I have nowhere to put it. You have a whole cafe.",
    steps: [
      {
        objective: { type: 'stock', any: ['dandelion'], count: 2 },
        note: 'Buy dandelion cordial at Root & Remedy in Oakhollow',
        progress: 'Buy two dandelion cordials at Root & Remedy in Oakhollow, so there is one '
          + 'left when I come back.',
        done: "You went. You actually went.\n\nRight. Pour me one, then. I'll be here.",
      },
      {
        objective: { type: 'deliver', item: 'dandelion', to: 'fennel', give: false },
        note: 'Serve Fennel his cordial, next time he is in',
        progress: 'Wait for Fennel to come in, then hand him a cordial. He is always in.',
      },
    ],
    reward: { money: 220, rep: 0.1, items: [['f_painting', 1]], friendship: ['fennel'] },
  },
  {
    id: 'the_grey_one',
    giver: 'linnet',
    night: true,
    title: 'The Grey One',
    desc: 'Linnet comes in every night for a cat who has stopped sitting with him.',
    offer: "May I ask you something, as the one who owns the cats?\n\n"
      + "The grey cat used to sit with me. Every night, same chair, the whole evening. Six weeks "
      + "now she has not come near me and I have been thinking it over and over.\n\n"
      + "I am not asking you to make her. You cannot make a cat do anything, and I would not "
      + "want her if you could. I am asking whether there is something I did wrong.",
    complete: "*the grey cat considers the bed, considers Linnet, and gets into the bed*\n\n"
      + "...She is not sitting with me. She is sitting *near* me.\n\n"
      + "That will do. That will do very nicely. Do not tell anyone I got emotional about "
      + "a deer-shaped absence in a chair.\n\nTake this. She has never once used it.",
    steps: [
      {
        objective: { type: 'furniture', place: 'catBed' },
        note: 'Put a cat bed in the cafe, somewhere he sits',
        progress: 'Get a cat bed. The pet shop in Brambleford has them. Put it somewhere near the chairs.',
        done: 'A bed, of course, she wanted a bed! My lap was not comfortable for her.',
      },
      {
        objective: { type: 'item', item: 'treats' },
        note: 'Get some cat treats',
        progress: 'Get treats from the pet shop again. I am not above bribery and neither is she.',
        done: 'Good. Now give me the treats. I would like her to think it was me who brought them.',
      },
      {
        objective: { type: 'deliver', item: 'treats', to: 'linnet', give: false },
        note: 'Hand the treats to Linnet, after dark',
        progress: 'Give them to him rather than doing it yourself. That is the whole point.',
      },
    ],
    reward: { money: 240, rep: 0.08, items: [['f_cattower', 1]], friendship: ['linnet'] },
  },
  {
    id: 'pun_off',
    giver: 'bruin',
    night: true,
    title: 'Longest Face Wins',
    desc: 'Bruin defends his losing streak at the valley pun contest and has run out of material.',
    offer: "Right. You look like someone who can keep a straight face. I need the opposite of that.\n\n"
      + "There's a contest. Longest Face Wins — whoever hears the most puns without laughing. "
      + "I have entered every year and lost every year, and I intend to lose *well*.\n\n"
      + "Only I have used everything I have. Go and get me three from the folk who are up at "
      + "this hour. They will not want to give them to you. Everybody has one.",
    complete: "*Bruin listens to all three, nodding slowly, like a man being handed tools*\n\n"
      + "The raven's is cruel, the otter's is wet, and the one from the bird is barely a pun at all — "
      + "which makes it the best of the three.\n\n"
      + "I shall lose magnificently. Here. You have earned something warm.",
    steps: [
      {
        objective: { type: 'talk', to: 'vesper' },
        note: 'Ask Vesper for a pun, up on the downs after dark',
        progress: 'Ask Vesper for a pun. She is up in Hollowdown after dark, somewhere with a '
          + 'view. Ravens are full of them.',
        done: "Why do I sit up here all night?\n\nBecause the view is *un-perch-edented*.\n\n"
          + "...I want it on the record that I said that under duress.",
      },
      {
        objective: { type: 'talk', to: 'brine' },
        note: 'Ask Brine for a pun, night fishing at Saltmere',
        progress: 'Ask Brine for a pun. He fishes off the Saltmere shore at night — ask while '
          + 'the fish are not biting.',
        done: "You want a pun. From me. At this hour.\n\nFine. What did the tide say to the shore?\n\n"
          + "Nothing. It just *waved*.\n\nNow go away, I've a line out.",
      },
      {
        objective: { type: 'talk', to: 'nightjar' },
        note: 'Find Nightjar in the dark and ask for a pun',
        progress: 'Look for Nightjar out in the dark between the towns. They do not stay '
          + 'anywhere for long.',
        done: '*a long churring whirr, then*\n\nI do not do puns.\n\n'
          + 'I do, however, go where it is dark. You could call that a *nocturnal habit*.\n\n'
          + '*the churring resumes, sounding very slightly pleased with itself*',
      },
      {
        objective: { type: 'talk', to: 'bruin' },
        note: 'Tell Bruin all three, next time he is in the cafe',
        progress: 'Wait for Bruin to let himself into your cafe after dark, then tell him all '
          + 'three. He does not go out to be found.',
      },
    ],
    reward: { money: 240, rep: 0.08, items: [['cocoa', 3]], friendship: ['bruin'] },
  },
  {
    id: 'wrong_bird',
    giver: 'pim',
    night: true,
    title: 'The Wrong Bird, Repeatedly',
    desc: 'Pim has been trying to find his bird friend Nightjar for eleven months and keeps talking to the wrong bird.',
    offer: "May I be honest with you? I have a difficulty.\n\n"
      + "There is a bird friend I met once and want to talk to again. Their name is Nightjar. "
      + "I have been trying to find them for eleven months. The difficulty is "
      + "that I have very bad eyesight, and on four separate occasions I started talking to entirely the wrong bird. "
      + "One of them was a post box.\n\n"
      + "They all look the same in the dark to my eyes, you see. If the bird I want to talk to were to make a "
      + "sound — a bell, say — I would know. Would you help?",
    complete: "*Pim is quiet for a long moment*\n\n"
      + "I heard it. Out past the hedges. One small bell, going the wrong way really fast.\n\n"
      + "I did not manage to say anything. But I knew which one it was, and that is eleven months "
      + "of progress in an evening. Take this. I have no use for it and you have been very kind.",
    steps: [
      {
        objective: { type: 'talk', to: 'nightjar' },
        note: 'Find Nightjar and work out where they go',
        progress: 'Go out in the dark between the towns. Nightjar does not keep still.',
        done: '*a whoosh close by you and then far away*\n\n'
          + 'You are looking for me on purpose. That\'s unusual.\n\n'
          + 'If you have something for me, I will be somewhere dark. That is not a riddle.',
      },
      {
        objective: { type: 'item', item: 'bell' },
        note: 'Buy a little bell at Whisker & Paw in Brambleford',
        progress: 'Get a little bell. The pet shop in Brambleford sells them for cats, but a bell is a bell.',
        done: 'Good. Now find them again — and they will not be where they were.',
      },
      {
        objective: { type: 'deliver', item: 'bell', to: 'nightjar', give: false },
        note: 'Give the bell to Nightjar, after dark',
        progress: 'Find Nightjar out in the dark again. They will be somewhere else this time.',
        done: '*the churring stops*\n\nA bell? Oh, so someone can tell it is me. '
          + 'Maybe that kind gentleman I met some time ago will find me\n\n'
          + '*a pause, and then the sound of a very small bell moving away at speed*',
      },
      {
        objective: { type: 'talk', to: 'pim' },
        note: 'Tell Pim it is done',
        progress: 'Go back to Pim down at Saltmere, after dark.',
      },
    ],
    reward: { money: 280, rep: 0.1, items: [['f_lamp', 1]], friendship: ['pim'] },
  },
  {
    id: 'mill_watch',
    giver: 'nutmeg',
    night: true,
    title: "Nutmeg's Position",
    desc: 'Nutmeg holds a night position at the old mill, and would like to hold it somewhere warmer.',
    offer: "I hold a position. At the mill. Nights.\n\n"
      + "The position is that I am at the mill, at night. That's all. Nothing more. I have held it "
      + "for two years and I have never once been asked to do anything, which I had taken as a "
      + "compliment.\n\n"
      + "It is, however, extremely cold. Would you find out from Grist whether I am, strictly "
      + "speaking, required? Do not lead him on. I want an honest answer and I want it to be no.",
    complete: "*Nutmeg receives this news with enormous dignity*\n\n"
      + "Two years. Nobody asked me. I simply started, and everyone assumed somebody else had hired me.\n\n"
      + "Then I shall resign, effective immediately, and I shall take up a new position: the corner "
      + "table in your cafe, nights, warm milk. Same duties. Better building.",
    steps: [
      {
        objective: { type: 'talk', to: 'grist' },
        note: 'Ask Grist whether the mill is actually being watched',
        progress: 'Ask Grist, in daylight, whether he employs a night watch at the mill. He is '
          + 'the one who keeps it.',
        done: "A night watch? At the mill?\n\nThere is no night watch at the mill. There has never "
          + "been a night watch at the mill. There is nothing in the mill but flour and one very "
          + "smug something asleep in the hopper.\n\n...Oh. Oh, that's who that is.",
      },
      {
        objective: { type: 'item', item: 'milk' },
        note: 'Get a bottle of warm milk to break it to him gently',
        progress: 'Get warm milk. Nutmeg is not going to take this standing up.',
        done: 'You are going to tell him, and you are going to have the milk ready. Good instinct.',
      },
      {
        objective: { type: 'deliver', item: 'milk', to: 'nutmeg', give: false },
        note: 'Take the milk, and the news, to Nutmeg after dark',
        progress: 'Take the milk to Nutmeg after dark. He is in Thistlewick, or at the mill, or '
          + 'asleep. Probably asleep.',
      },
    ],
    reward: { money: 200, rep: 0.06, items: [['f_catbed', 1]], friendship: ['nutmeg'] },
  },
  {
    id: 'stone_circle',
    giver: 'vesper',
    night: true,
    title: 'What The Stones Do',
    desc: 'Vesper insists the standing stones do something after dark, and will not say what.',
    offer: "You want to know what I do up here all night? I watch the stones.\n\n"
      + "No, I'm not telling you. If I tell you, you'll go up expecting it, and you'll see "
      + "what you expected. Go and stand in the middle of them after dark and come back to me.\n\n"
      + "Bring a saucer of milk. You'll see why.",
    complete: "So now you know.\n\n"
      + "Everyone who has ever left a saucer there has found it empty. Every single one. "
      + "For as long as anyone has been writing it down.\n\n"
      + "Nobody has ever seen what drinks it. I have watched for four years.",
    steps: [
      {
        objective: { type: 'flag', flag: 'stood_in_stones' },
        note: 'Stand in the middle of the standing stones, after dark',
        progress: 'Go to the standing stones on the high downs to the north-east and stand in '
          + 'the middle of them after dark. Not from the edge.',
        done: 'Warm, were they? Under your hand? Good. Now go and find out how long that has been going on.',
      },
      {
        objective: { type: 'flag', flag: 'read_stones' },
        note: 'Read about the stones at the Reading Room in Brambleford',
        progress: 'Read the book on the stones at the Reading Room in Brambleford. Somebody '
          + 'bound it by hand and it is slightly damp.',
        done: 'A saucer of milk. Returned empty. That is the entry I wanted you to find.',
      },
      {
        objective: { type: 'item', item: 'milk' },
        note: 'Get a bottle of milk',
        progress: 'Buy milk at the grocer in Brambleford. Any milk will do.',
        done: 'Right. Up you go, then. Leave it in the middle and step back.',
      },
      {
        objective: { type: 'flag', flag: 'left_milk' },
        note: 'Leave the milk at the standing stones, after dark',
        progress: 'Leave the milk in the middle of the stones after dark, then wait a moment.',
      },
    ],
    reward: { money: 260, rep: 0.08, items: [['catnip', 1]], flags: ['hint_stones'] },
  },
  {
    id: 'lit_window',
    giver: 'tallow',
    night: true,
    title: 'A Lit Window',
    desc: 'Tallow thinks the cafe is wasting its evenings.',
    offer: "Your place is dark at night. That's a waste of a building.\n\n"
      + "A lit window after sunset is the most inviting thing there is. People walk towards it "
      + "without deciding to.\n\n"
      + "Put a lamp in that cafe of yours, then keep the door open past sunset and see who comes.",
    complete: 'I walked past last night and there it was. Warm square of light with cats in it.\n\n'
      + "I stood there like an idiot for a full minute.\n\nThat's the trade. That's all of it.",
    steps: [
      {
        objective: { type: 'furniture', place: 'lampIn' },
        note: 'Put a lamp in the cafe',
        progress: 'Buy a floor lamp at Velvet & Oak in Thistlewick and put it in the cafe.',
        done: "Good. Now leave the sign on OPEN past sunset and actually be in there.",
      },
      {
        objective: { type: 'flag', flag: 'served_after_dark' },
        note: 'Serve somebody in the cafe after dark',
        progress: 'Keep the sign on OPEN past sunset and stand behind the counter yourself. '
          + 'Somebody will come.',
      },
    ],
    reward: { money: 220, rep: 0.12, friendship: ['tallow'] },
  },
  {
    id: 'music_night',
    giver: 'lark',
    title: 'Somewhere to Play',
    desc: 'Lark would love a piano to play in a warm room.',
    objective: { type: 'furniture', place: 'piano' },
    reward: { money: 260, rep: 0.12, friendship: ['lark'] },
    offer: "I sing for anyone who'll listen, which out here is mostly sheep.\n\nPut a piano in that cafe of yours and I'll come every evening. Free. Ask the flea market, they get one now and then.",
    progress: 'Get a piano into the cafe. The flea market in Thistlewick turns one up now and then.',
    complete: "You *got* one.\n\nRight. I'm here every evening from now on. Your regulars are about to get very fond of this place.",
  },
];

export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
export const QUESTS_BY_GIVER = QUESTS.reduce((m, q) => {
  (m[q.giver] ||= []).push(q);
  return m;
}, {});

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
//
// A quest is a list of steps done in order. Most have one, which is why they
// can still be written with a bare `objective` and `progress`; the longer ones
// spell out a `steps` array, where each step has its own thing to do, its own
// line for the journal, and its own line for whoever you report back to.

/** Every quest as a list of steps, however it was written. */
export function questSteps(q) {
  if (q.steps) return q.steps;
  return [{ objective: q.objective, progress: q.progress }];
}

/** Which step of `q` is in play. */
export function stepIndex(q, st) {
  const n = questSteps(q).length;
  return Math.min(st.questStep?.[q.id] || 0, n - 1);
}

export function currentStep(q, st) { return questSteps(q)[stepIndex(q, st)]; }

export function isLastStep(q, st) { return stepIndex(q, st) >= questSteps(q).length - 1; }

/** Has the player done what the step in play asks? */
export function objectiveMet(q, st) {
  return stepMet(currentStep(q, st).objective, st);
}

export function stepMet(o, st) {
  if (!o) return false;
  switch (o.type) {
    case 'stock': {
      const n = o.any.reduce((s, id) => s + st.cafeSim.stockCount(id), 0);
      return n >= o.count;
    }
    case 'item': {
      const need = o.count || 1;
      if ((st.inventory[o.item] || 0) >= need) return true;
      // A bought bottle of milk lands in the pantry rather than the bag, so
      // "get a bottle of milk" was a step you could never finish by buying one.
      return !!st.cafeSim && st.cafeSim.stockCount(o.item) >= need;
    }
    case 'deliver':
    case 'talk':
      return false; // both are finished by talking to somebody
    case 'flag':
      return !!st.flags[o.flag];
    case 'cats':
      return st.cats.length >= o.count;
    case 'coat':
      return st.cats.some((c) => c.coatQuality >= o.quality);
    case 'rooms':
      return st.cafe.rooms.length >= o.count;
    case 'profit':
      return st.bestDayProfit >= o.amount;
    // Seats you have had at once rather than seats you have now: taking a
    // chair out for a week should not undo having built the place up.
    case 'money':
      return st.money >= o.amount;
    case 'seatsEver':
      return (st.flags.most_seats || 0) >= o.count;
    case 'gross':
      return (st.bestDayGross || 0) >= o.amount;
    case 'rarecat':
      return st.cats.some((c) => { const b = st.breedInfo(c.breed); return b && b.rare; });
    case 'furniture':
      return st.cafe.furniture.some((f) => f.type === o.place);
    default:
      return false;
  }
}

/** Short "what do I do now" text for the journal. */
export function objectiveText(q, st) {
  const step = currentStep(q, st);
  const o = step.objective;
  const n = questSteps(q).length;
  const of = n > 1 ? ` (${stepIndex(q, st) + 1}/${n})` : '';
  // Done it, but nobody has been told. The step moves when you report back —
  // their reply to it is half the reason for going — so the journal should ask
  // for that rather than go on asking for the thing you have already done.
  if (reportBack(q, st)) return `Go back and tell ${st.villagerName(q.giver)}${of}`;
  return stepText(o, st, step) + of;
}

/**
 * Is this step finished and waiting to be handed in? `talk` and `deliver` steps
 * are finished *by* the conversation, so they are never in this state.
 */
export function reportBack(q, st) {
  if (st.quests[q.id] !== 'active') return false;
  const o = currentStep(q, st).objective;
  if (o.type === 'talk' || o.type === 'deliver') return false;
  return stepMet(o, st);
}

/** "a piano", "a stone fireplace" — what a `furniture` step is asking for. */
function placeName(place) {
  const entry = Object.values(ITEMS).find((v) => v.place === place);
  if (!entry) return 'that';
  const name = entry.name.toLowerCase();
  return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
}

function stepText(o, st, step) {
  if (step && step.note) return step.note;
  switch (o.type) {
    case 'stock': {
      const n = o.any.reduce((s, id) => s + st.cafeSim.stockCount(id), 0);
      const what = o.any.map((id) => st.itemName(id)).join(' or ');
      return `Stock ${what} (${Math.min(n, o.count)}/${o.count})`;
    }
    case 'item': {
      const want = o.count || 1;
      // The pantry counts as well as the bag, the same way the step does —
      // otherwise a bought bottle of milk reads 0/1 while the step is done.
      const held = (st.inventory[o.item] || 0) + (st.cafeSim ? st.cafeSim.stockCount(o.item) : 0);
      return `Get ${st.itemName(o.item)} (${Math.min(held, want)}/${want})`;
    }
    case 'deliver': return `Take ${st.itemName(o.item)} to ${st.villagerName(o.to)}`;
    case 'talk': return `Go and see ${st.villagerName(o.to)}`;
    case 'flag': return 'Clear whatever is in the way';
    case 'cats': return `Adopt ${o.count} cats (${st.cats.length}/${o.count})`;
    case 'coat': return 'Feed a cat well until its coat improves';
    case 'rooms': return `Build another room onto the cafe (${st.cafe.rooms.length}/${o.count})`;
    case 'profit': return `Clear ${o.amount} profit in one day (best so far: ${Math.round(st.bestDayProfit)})`;
    case 'money': return `Save up ${o.amount} (${Math.min(st.money, o.amount)}/${o.amount})`;
    case 'seatsEver': return `Have ${o.count} seats in the cafe (${Math.min(st.flags.most_seats || 0, o.count)}/${o.count})`;
    case 'gross': return `Take ${o.amount} in one day (best so far: ${Math.round(st.bestDayGross || 0)})`;
    case 'rarecat': return 'Adopt a rare breed';
    case 'furniture': return `Put ${placeName(o.place)} in the cafe`;
    default: return '';
  }
}

/** The line the giver says while you're partway through. */
export function progressText(q, st) {
  if (reportBack(q, st)) {
    return `That part is done. Go and tell ${st.villagerName(q.giver)} about it.`;
  }
  // A note may be written as a function of the world, for jobs whose next move
  // depends on something you have been told. "Ask around Saltmere" is the right
  // note until somebody down there answers, and quite the wrong one afterwards.
  const p = currentStep(q, st).progress || q.progress;
  return (typeof p === 'function' ? p(st) : p) || 'Still on it, then?';
}

/**
 * Put a job back where the world says it should be.
 *
 * A quest's step number and the state of the world can disagree — most obviously
 * because two players could once both accept the same job, which reset the count
 * under whoever was ahead. Rather than trust the number, walk the steps and skip
 * any whose objective is already satisfied: if you are holding the collar, you
 * are past the step that asks you to find it, whatever the save says.
 *
 * Only ever moves forward, and only over steps that are genuinely done, so
 * running it on a healthy save changes nothing.
 */
/**
 * Has this step been done? Either its objective still reads as satisfied, or a
 * flag it left behind says so. The second half matters for steps that consume
 * what they asked for: once the collar is handed over you are not holding it,
 * and "are you holding the collar" is then false forever.
 */
export function stepDone(step, st) {
  if (step.evidence && st.flags?.[step.evidence]) return true;
  return stepMet(step.objective, st);
}

/**
 * Put back a one-off quest item the player is supposed to have and hasn't.
 *
 * Some things exist once in the whole valley — the golden collar is dug out of
 * the pier and the pier will not do it twice. If the flag says you found it,
 * the job still wants it, and it is not in your bag, then it went missing to a
 * bug and the job is unfinishable until it comes back.
 */
export function repairLostItems(st, give) {
  let fixed = 0;
  for (const q of QUESTS) {
    if (st.quests[q.id] !== 'active') continue;
    const steps = questSteps(q);
    const cur = steps[Math.min(st.questStep?.[q.id] || 0, steps.length - 1)];
    const o = cur.objective;
    const want = o.type === 'item' || o.type === 'deliver' ? o.item : null;
    if (!want || (st.inventory[want] || 0) > 0) continue;
    const proof = steps.find((s) => s.evidence && s.objective.item === want);
    if (!proof || !st.flags?.[proof.evidence]) continue;
    give(want, 1);
    fixed++;
  }
  return fixed;
}

export function repairStep(q, st) {
  if (st.quests[q.id] !== 'active') return 0;
  const steps = questSteps(q);

  // Look for the furthest step we can *prove* has been done, and take that as
  // where the player has got to. Scanning forward rather than walking matters:
  // `talk` and `deliver` steps leave no trace, but a later step that has
  // plainly been finished proves the untestable ones in between were too —
  // you cannot be holding the collar without having met the dog who wants it.
  let target = 0;
  for (let i = 0; i < steps.length; i++) {
    if (stepDone(steps[i], st)) target = i + 1;
  }
  // Never past the last step: finishing a job takes a conversation, and the
  // reward and the closing scene belong to that conversation.
  target = Math.min(target, steps.length - 1);

  const from = st.questStep?.[q.id] || 0;
  if (target <= from) return 0;
  st.setQuestStep(q.id, target);
  return target - from;
}

/** Repair every job in play. Returns how many were moved on. */
export function repairAllSteps(st) {
  let moved = 0;
  for (const q of QUESTS) if (repairStep(q, st) > 0) moved++;
  return moved;
}
