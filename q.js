	{
		id: 'the_telephone',
		giver: 'hollis',
		title: 'A Line Out',
		desc: 'Hollis at the inn thinks a cafe your size ought to have a telephone.',
		offer: "I have been watching your place fill up! You are past being a nice little spot, you are a business."
			+ "Have you thought about doing deliveries? You'll need a telephone."
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
				progress: 'Forty seats. Build the rooms, then fill them — sofas and benches count for three.',
				done: 'Show me a day that fills forty seats at your cafe.',
			},
			{
				objective: { type: 'gross', amount: 1000 },
				note: 'Take 1000 in a single day',
				progress: 'A thousand made in one day, before costs. The morning card keeps the record.',
				done: "That'll do. Now go and pay the phone company in Hollowdown, ask for a new line.",
			},
			{
				objective: { type: 'money', amount: 600 },
				note: 'Have 600 to pay the exchange',
				progress: 'Six hundred. The exchange does not do favours and neither do I.',
				done: 'Good. Come and see me and we will get you connected.',
			},
			{
				objective: { type: 'talk', to: 'hollis' },
				note: 'See Hollis at the Sleeping Hare',
				progress: 'Back to the inn in Brambleford. Hollis is behind the bar, as ever.',
			},
		],
		reward: { money: -600, items: [['f_telephone', 1]], rep: 0.1, friendship: ['hollis'] },
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
				done: 'Good. Now give me the treats. I would like her to think it was me did brought her these treats.',
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
				progress: 'Find Nightjar out into the dark. They will be somewhere else this time.',
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
				progress: 'Grist keeps the old mill. Ask him, in daylight, whether he employs a night watch.',
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
				progress: 'Nutmeg is in Thistlewick after dark, or at the mill, or asleep. Probably asleep.',
			},
		],
		reward: { money: 200, rep: 0.06, items: [['f_catbed', 1]], friendship: ['nutmeg'] },
	},


