// The words invite codes are made of: one from each list and four digits, as in
// plum-otter-4271. Easy to read out across a room and to type on a tablet.
//
// Chosen by hand, for a game kids play: nothing rude, nothing scary, no slang
// that turns rude, nothing about bodies, and no word in both lists. Lowercase
// letters only, so a code survives being said aloud, autocorrected or typed in
// capitals. test/valleys.test.js holds them to all of that.
//
// Adding words is safe at any time. Removing one is too: a code already handed
// out is kept in its valley's file, not rebuilt from these.

export const ADJECTIVES = [
  'agile', 'airy', 'amber', 'ample', 'azure', 'balmy', 'bendy', 'big', 'blithe', 'blue',
  'bold', 'bouncy', 'brave', 'breezy', 'bright', 'brisk', 'bubbly', 'bumpy', 'busy', 'calm',
  'caring', 'cheery', 'chipper', 'chirpy', 'classy', 'clever', 'cloudy', 'comfy', 'cool', 'coral',
  'cosmic', 'cozy', 'crafty', 'crisp', 'cuddly', 'curly', 'cute', 'dainty', 'dandy', 'dapper',
  'daring', 'dear', 'deft', 'dewy', 'dizzy', 'dreamy', 'eager', 'early', 'easy', 'elfin',
  'epic', 'fair', 'fancy', 'fast', 'feisty', 'fizzy', 'flashy', 'fluffy', 'fond', 'frisky',
  'frosty', 'fuzzy', 'gentle', 'giddy', 'glad', 'gleeful', 'glossy', 'glowy', 'golden', 'good',
  'goofy', 'grand', 'green', 'groovy', 'gusty', 'handy', 'happy', 'hardy', 'hearty', 'helpful',
  'honest', 'hopeful', 'humble', 'hushed', 'jaunty', 'jazzy', 'jolly', 'jovial', 'joyful', 'jumpy',
  'keen', 'kind', 'kindly', 'lavish', 'leafy', 'lemony', 'lilac', 'lively', 'lofty', 'loyal',
  'lucky', 'lunar', 'magic', 'maple', 'mellow', 'merry', 'mighty', 'mild', 'minty', 'misty',
  'modest', 'mossy', 'neat', 'nice', 'nifty', 'nimble', 'noble', 'oaken', 'patient', 'peachy',
  'pebbly', 'peppy', 'perky', 'plucky', 'plush', 'polite', 'posh', 'pretty', 'prime', 'proud',
  'puffy', 'punchy', 'quick', 'quiet', 'quirky', 'rainy', 'rapid', 'rocky', 'roomy', 'rosy',
  'royal', 'ruby', 'rugged', 'rustic', 'sandy', 'savvy', 'scarlet', 'scrappy', 'sharp', 'shiny',
  'silky', 'silver', 'simple', 'sincere', 'skippy', 'sleek', 'sleepy', 'smart', 'smiley', 'smooth',
  'snappy', 'snowy', 'snug', 'soft', 'solar', 'sparkly', 'speedy', 'spiffy', 'spry', 'spunky',
  'starry', 'steady', 'stellar', 'sturdy', 'sugary', 'sunlit', 'sunny', 'super', 'sweet', 'swift',
  'tender', 'thrifty', 'tidy', 'timely', 'tiny', 'toasty', 'tranquil', 'trim', 'tropic', 'trusty',
  'twinkly', 'unique', 'upbeat', 'valiant', 'vast', 'velvet', 'vivid', 'wacky', 'warm', 'wavy',
  'whimsy', 'wiggly', 'windy', 'wise', 'witty', 'wobbly', 'woolly', 'yummy', 'zany', 'zen',
  'zesty', 'zingy', 'zippy', 'jade', 'dappled', 'cobalt', 'dusky', 'earthy', 'glassy', 'grassy',
  'hazy', 'inky', 'jumbo', 'kooky', 'lanky', 'lazy', 'lumpy', 'mini', 'moonlit', 'murky',
  'nautical', 'orange', 'pastel', 'pink', 'purple', 'rusty', 'sable', 'shady', 'smoky', 'spotty',
  'sudsy', 'swirly', 'tangy', 'teal', 'tufty', 'violet', 'wintry', 'zigzag', 'cheeky', 'bashful',
];

export const NOUNS = [
  'otter', 'bunny', 'kitten', 'puppy', 'panda', 'koala', 'llama', 'alpaca', 'lamb', 'piglet',
  'pony', 'fox', 'owl', 'robin', 'wren', 'finch', 'sparrow', 'swallow', 'heron', 'puffin',
  'penguin', 'seal', 'walrus', 'whale', 'dolphin', 'turtle', 'tortoise', 'frog', 'toad', 'newt',
  'gecko', 'iguana', 'hamster', 'gerbil', 'ferret', 'mole', 'vole', 'hedgehog', 'squirrel', 'chipmunk',
  'raccoon', 'moose', 'deer', 'fawn', 'elk', 'bison', 'yak', 'goat', 'sheep', 'camel',
  'zebra', 'giraffe', 'hippo', 'rhino', 'lion', 'tiger', 'cheetah', 'leopard', 'lynx', 'bobcat',
  'jaguar', 'panther', 'coyote', 'dingo', 'husky', 'poodle', 'beagle', 'corgi', 'collie', 'terrier',
  'pug', 'tabby', 'calico', 'kitty', 'duckling', 'duck', 'goose', 'swan', 'gosling', 'hen',
  'rooster', 'parrot', 'macaw', 'toucan', 'flamingo', 'pelican', 'gull', 'crane', 'stork', 'ibis',
  'eagle', 'hawk', 'falcon', 'kestrel', 'osprey', 'raven', 'magpie', 'jay', 'cardinal', 'oriole',
  'lark', 'thrush', 'starling', 'bluebird', 'kiwi', 'emu', 'ostrich', 'bee', 'ladybug', 'cricket',
  'firefly', 'beetle', 'moth', 'snail', 'crab', 'lobster', 'shrimp', 'octopus', 'squid', 'starfish',
  'clam', 'oyster', 'minnow', 'salmon', 'trout', 'guppy', 'goldfish', 'koi', 'manatee', 'narwhal',
  'orca', 'muffin', 'cupcake', 'cookie', 'waffle', 'pancake', 'biscuit', 'scone', 'pretzel', 'bagel',
  'donut', 'crumpet', 'toffee', 'fudge', 'caramel', 'cocoa', 'latte', 'mocha', 'sundae', 'sorbet',
  'gelato', 'pudding', 'custard', 'jelly', 'honey', 'peach', 'plum', 'pear', 'apple', 'cherry',
  'berry', 'mango', 'melon', 'lemon', 'lime', 'grape', 'fig', 'pumpkin', 'carrot', 'radish',
  'pea', 'bean', 'turnip', 'potato', 'tomato', 'pickle', 'noodle', 'dumpling', 'taco', 'pizza',
  'popcorn', 'peanut', 'walnut', 'acorn', 'almond', 'cashew', 'pecan', 'pebble', 'cloud', 'comet',
  'meteor', 'planet', 'moon', 'star', 'rainbow', 'river', 'brook', 'meadow', 'garden', 'forest',
  'teapot', 'kettle', 'mitten', 'scarf', 'beanie', 'button', 'ribbon', 'lantern', 'candle', 'compass',
  'kite', 'rocket', 'wagon', 'sled', 'banjo', 'trumpet', 'tuba', 'violin', 'piano', 'drum',
  'bell', 'whistle', 'marble', 'puzzle', 'crayon', 'pencil', 'teacup', 'saucer', 'spoon', 'ladle',
  'basket', 'quilt', 'pillow', 'blanket', 'slipper', 'sock', 'boot', 'umbrella', 'pinecone', 'clover',
  'daisy', 'tulip', 'poppy', 'lily', 'rose', 'iris', 'fern', 'moss', 'willow', 'birch',
  'cedar', 'aspen', 'pine', 'cactus', 'sprout', 'seedling', 'mushroom', 'truffle', 'meerkat', 'lemur',
];
