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
    progress: "Six portions. Coffee or tea. I'm not asking for the moon.",
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
    progress: 'Oakhollow. Follow the road east and then north. Look for the very large tree.',
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
    progress: 'Saltmere, on the coast, south-west. Ask the otter by the water.',
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
    progress: 'Hollowdown, up on the chalk hills to the north. Ask for Chalk.',
    complete: "Oh. Oh! From Nettle? Well. Well well well.\n\nHere, take this — you'll want to know the birds run a taxi service. Perch in every town.",
  },
  {
    id: 'sea_shell',
    giver: 'juniper',
    title: 'Something for the Window',
    desc: 'Juniper thinks your cafe needs a spiral shell on the windowsill.',
    objective: { type: 'item', item: 'seashell', count: 1 },
    reward: { money: 110, items: [['f_plant', 1]], rep: 0.04 },
    offer: "Your place needs a *thing*. An object. Something with a story.\n\nFind a spiral shell on the Saltmere beach. Big one. Put it on the windowsill and watch people ask about it.",
    progress: 'The beach at Saltmere. Look along the tideline after you get there.',
    complete: "Perfect. Absolutely perfect.\n\nHere, have this fern too. Trust me on the fern.",
  },
  {
    id: 'clear_the_path',
    giver: 'gorse',
    title: 'The Fallen Chalk',
    desc: 'A slab of chalk is blocking the eastern pass. Gorse says the right tool would shift it.',
    objective: { type: 'flag', flag: 'barrier_eastpass' },
    reward: { money: 260, rep: 0.05 },
    offer: "That path east has been shut since the storm. Great lump of chalk across it.\n\nGet a pick from the Chalk Pit Store and shift it. Everyone in this town will be quietly grateful and nobody will say so.",
    progress: 'A chalk pick, from the Chalk Pit Store here in Hollowdown. Then the eastern pass.',
    complete: "You shifted it? On your own?\n\nRight. That's the road to Thistlewick open again. Take this, and don't argue.",
  },
  {
    id: 'bramble_path',
    giver: 'grist',
    title: 'The Way to the Mill',
    desc: 'Brambles have swallowed the path to the old mill. Grist would like it opened.',
    objective: { type: 'flag', flag: 'barrier_millpath' },
    reward: { money: 220, items: [['valley_map', 1]] },
    offer: "The old mill's my family's, technically. Can't reach it — brambles have taken the whole path.\n\nShears would do it. The hardware place up in Hollowdown sells them.",
    progress: 'Hedge shears from the Chalk Pit Store, then the path north of the river.',
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
    progress: 'Four cats. Whisker & Paw down the lane sells them.',
    complete: "Four! I counted twice.\n\nHere. Spend it on something for them, not for you.",
  },
  {
    id: 'good_coat',
    giver: 'suds',
    title: 'Show Me a Silky Coat',
    desc: 'Suds wants to see what proper food does to a cat, not just grooming.',
    objective: { type: 'coat', quality: 1.35 },
    reward: { money: 240, items: [['brush', 1]], hint: 'fish' },
    offer: "Everyone thinks grooming is the whole story. It isn't. Food's half of it.\n\nFeed your cats properly for a few days — real food, not kibble — and bring one back to me.",
    progress: 'Good food or fresh fish, a few days running. Kibble will not do it.',
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
    progress: 'One more room on the cafe. Hire workers from me first, then build.',
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
    progress: 'Four hundred in profit, in one day, net of all costs.',
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
    progress: 'A rare breed. From here, generally. I do open some days.',
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
    progress: 'The lighthouse, west along the coast past Saltmere.',
    complete: "Eleven years of tides and weather... and one line, near the end.\n\n'The cat has stopped coming. I shall wait a while longer.'\n\nHm. Take this lantern. Somebody should keep something burning.",
  },
  {
    id: 'music_night',
    giver: 'lark',
    title: 'Somewhere to Play',
    desc: 'Lark would love a piano to play in a warm room.',
    objective: { type: 'furniture', place: 'piano' },
    reward: { money: 260, rep: 0.12, friendship: ['lark'] },
    offer: "I sing for anyone who'll listen, which out here is mostly sheep.\n\nPut a piano in that cafe of yours and I'll come every evening. Free. Ask the flea market, they get one now and then.",
    progress: 'A piano, in the cafe. The flea market gets them occasionally.',
    complete: "You *got* one.\n\nRight. I'm here every evening from now on. Your regulars are about to get very fond of this place.",
  },
];

export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
export const QUESTS_BY_GIVER = QUESTS.reduce((m, q) => {
  (m[q.giver] ||= []).push(q);
  return m;
}, {});

/** Has the player met this quest's objective? */
export function objectiveMet(q, st) {
  const o = q.objective;
  switch (o.type) {
    case 'stock': {
      const n = o.any.reduce((s, id) => s + st.cafeSim.stockCount(id), 0);
      return n >= o.count;
    }
    case 'item':
      return (st.inventory[o.item] || 0) >= (o.count || 1);
    case 'deliver':
      return false; // completed by talking to the recipient
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
  const o = q.objective;
  switch (o.type) {
    case 'stock': {
      const n = o.any.reduce((s, id) => s + st.cafeSim.stockCount(id), 0);
      return `Stock coffee or tea (${Math.min(n, o.count)}/${o.count})`;
    }
    case 'item': return `Find: ${st.itemName(o.item)} (${Math.min(st.inventory[o.item] || 0, o.count || 1)}/${o.count || 1})`;
    case 'deliver': return `Deliver ${st.itemName(o.item)} to ${st.villagerName(o.to)}`;
    case 'flag': return 'Clear the way';
    case 'cats': return `Own ${o.count} cats (${st.cats.length}/${o.count})`;
    case 'coat': return 'Raise a cat\'s coat with good food';
    case 'rooms': return `Build another room (${st.cafe.rooms.length}/${o.count})`;
    case 'profit': return `Clear ${o.amount} profit in a day (best: ${Math.round(st.bestDayProfit)})`;
    case 'rarecat': return 'Own a rare breed';
    case 'furniture': return 'Put a piano in the cafe';
    default: return '';
  }
}
