// In-game help pages. Text uses only characters the pixel font has.

export interface HelpPage {
  title: string;
  /** Paragraphs, word-wrapped when drawn; '' adds a blank line. */
  text: string[];
}

export const HELP_PAGES: HelpPage[] = [
  {
    title: 'PONGMAN',
    text: [
      'PONG, BUT THE BALL IS PONGMAN AND THE COURT IS A MAZE FULL OF DOTS AND GHOSTS.',
      '',
      'HE STICKS TO YOUR PADDLE, THEN HE IS SHOT. SHOOT HIM INTO AN OPENING - OFF A WALL HE COMES STRAIGHT BACK.',
      '',
      'YELLOW PLAYS LEFT WITH W AND S. RED PLAYS RIGHT WITH THE ARROWS. ALONE, YOU ARE YELLOW AND EITHER WORKS.',
    ],
  },
  {
    title: 'STEERING',
    text: [
      'WHOEVER SHOT HIM STEERS HIM: WHILE HE FLIES, YOUR PADDLE MOVES ARE HIS TURNS.',
      '',
      'HOLD UP OR DOWN AND HE TAKES THAT TURN WHEN HE CAN. LET GO AND HE HEADS FOR THE OTHER SIDE. HE NEVER STOPS AND NEVER TURNS BACK.',
      '',
      'THE DOTS HE EATS ARE YOURS. MIND THAT YOUR PADDLE MOVES TOO.',
    ],
  },
  {
    title: 'THE BAR',
    text: [
      'THE BAR AT THE TOP IS A TUG OF WAR. EVERYTHING YOU SCORE PULLS PONGMAN YOUR WAY. GET HIM TO YOUR END AND YOU WIN.',
      '',
      'A GOAL - PAST THE OTHER PADDLE - IS THE BIG PULL. DOTS, PELLETS, GHOSTS AND INVADERS ADD UP. A DEATH PULLS BACK.',
      '',
      'MATCH SETS HOW MANY GOALS AHEAD WINS.',
    ],
  },
  {
    title: 'GHOSTS',
    text: [
      'FOUR GHOSTS ROAM THE MAZE. RUN INTO ONE AND PONGMAN DIES - AND THE OTHER SIDE HAS HIM ON THEIR PADDLE AT ONCE.',
      '',
      'A POWER PELLET IN A CORNER TURNS THEM BLUE FOR A WHILE. THEN HE EATS THEM: 200, 400, 800, 1600.',
      '',
      'EATEN GHOSTS GO HOME TO THE PEN AND COME BACK OUT.',
    ],
  },
  {
    title: 'INVADERS',
    text: [
      'ALIENS LAND IN THE MAZE NOW AND THEN. EAT ONE AND SIX INVADERS DROP INTO THE OTHER LANE.',
      '',
      'THEY BOMB THE PADDLE THERE. A HIT STUNS IT FOR A MOMENT - A BAD MOMENT IF THE BALL IS COMING.',
      '',
      'THE PADDLE SHOOTS BACK BY ITSELF. EACH INVADER SHOT DOWN IS 50.',
    ],
  },
  {
    title: 'THE GORILLA',
    text: [
      'NOW AND THEN A GORILLA CLIMBS UP AT THE BOTTOM, BEATS HIS CHEST AND LOBS BARRELS OVER THE MAZE AT THE PADDLES.',
      '',
      'A MARK SHOWS WHERE EACH BARREL WILL COME DOWN. STEP ASIDE: A BARREL ON YOUR PADDLE STUNS IT AND COSTS YOU 50.',
      '',
      'HE GOES AWAY BY HIMSELF AFTER FIVE.',
    ],
  },
  {
    title: 'SCORING',
    text: [
      'GOAL: 500',
      'DOT: 10',
      'POWER PELLET: 50',
      'GHOSTS: 200, 400, 800, 1600',
      'ALIEN: 100',
      'INVADER SHOT: 50',
      'MAZE CLEARED: 1000',
      'DEATH: -100',
      'BARREL ON YOUR PADDLE: -50',
      '',
      'AGAINST THE CPU YOUR POINTS GO ON THE TABLE, WIN OR LOSE. EACH DIFFICULTY HAS ITS OWN.',
    ],
  },
  {
    title: 'CONTROLS',
    text: [
      'W S: YELLOW PADDLE',
      'UP DOWN: RED PADDLE',
      'GAMEPADS: STICK OR PAD, ONE EACH',
      'ENTER OR ESC: PAUSE',
      'BACKSPACE: QUIT WHEN PAUSED',
      'M: MUSIC ON OR OFF',
      'H: HIGH SCORES - TITLE SCREEN',
      '',
      'ON A TOUCH SCREEN DRAG ON YOUR HALF OF THE COURT.',
    ],
  },
];

/** Splits paragraphs into lines of at most `width` characters. */
export function wrapText(paragraphs: string[], width: number) {
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      if (line && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    lines.push(line);
  }
  return lines;
}
