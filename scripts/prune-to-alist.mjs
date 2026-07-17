/**
 * Prunes seed catalogs to A-list songs that were massive international
 * hits in the 1980s (RithmGen standard).
 *
 * Run: node scripts/prune-to-alist.mjs && node scripts/build-catalog.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const seedsDir = path.join(dataDir, "_seeds");

/** @typedef {[string, string, number, string]} Row */

function norm(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[''']/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function key(title, artist) {
  return `${norm(title)}|${norm(artist)}`;
}

/**
 * Allowlist of A-list international 80s megahits per genre.
 * Keys are normalized "title|artist". Artist match is loose (contains).
 * Empty array = remove entire genre shelf (no qualifying tracks).
 */
const KEEP = {
  Pop: null, // use deny list below — Pop is already mostly megahits
  Rock: null, // use deny list
  "Hip-Hop / Rap": null,
  "R&B": null,
  "Electronic / Dance": null,
  Reggae: [
    ["Could You Be Loved", "Bob Marley"],
    ["Redemption Song", "Bob Marley"],
    ["Three Little Birds", "Bob Marley"],
    ["Buffalo Soldier", "Bob Marley"],
    ["One Love / People Get Ready", "Bob Marley"],
    ["Is This Love", "Bob Marley"],
    ["Pass the Dutchie", "Musical Youth"],
    ["Night Nurse", "Gregory Isaacs"],
    ["Electric Boogie", "Marcia Griffiths"],
    ["Red Red Wine", "UB40"],
    ["I Got You Babe", "UB40"],
    ["(I Can't Help) Falling in Love With You", "UB40"],
    ["Food for Thought", "UB40"],
    ["Kingston Town", "UB40"],
    ["Ghost Town", "The Specials"],
  ],
  Jazz: [
    ["Rockit", "Herbie Hancock"],
    ["Songbird", "Kenny G"],
    ["Give Me the Night", "George Benson"],
    ["Turn Your Love Around", "George Benson"],
    ["Rise", "Herb Alpert"],
    ["We're in This Love Together", "Al Jarreau"],
  ],
  Country: [
    ["Islands in the Stream", "Kenny Rogers"],
    ["Islands in the Stream", "Dolly Parton"],
    ["9 to 5", "Dolly Parton"],
    ["Lady", "Kenny Rogers"],
    ["Always on My Mind", "Willie Nelson"],
    ["On the Road Again", "Willie Nelson"],
    ["To All the Girls I've Loved Before", "Willie Nelson"],
    ["Elvira", "Oak Ridge Boys"],
    ["I Love a Rainy Night", "Eddie Rabbitt"],
    ["Drivin' My Life Away", "Eddie Rabbitt"],
    ["Bette Davis Eyes", "Kim Carnes"],
    ["Forever and Ever, Amen", "Randy Travis"],
  ],
  Classical: [
    ["Chariots of Fire", "Vangelis"],
    ["Raiders March", "John Williams"],
    ["Imperial March", "John Williams"],
    ["E.T. Theme", "John Williams"],
    ["Olympic Fanfare and Theme", "John Williams"],
  ],
  "Latin Music": [
    ["Conga", "Gloria Estefan"],
    ["Rhythm Is Gonna Get You", "Gloria Estefan"],
    ["1-2-3", "Gloria Estefan"],
    ["Don't Wanna Lose You", "Gloria Estefan"],
    ["Anything for You", "Gloria Estefan"],
    ["La Bamba", "Los Lobos"],
    ["Bamboleo", "Gipsy Kings"],
    ["Smooth Operator", "Sade"],
    ["The Sweetest Taboo", "Sade"],
    ["Your Love Is King", "Sade"],
    ["La Isla Bonita", "Madonna"],
    ["To All the Girls I've Loved Before", "Julio Iglesias"],
  ],
  Metal: [
    ["One", "Metallica"],
    ["Master of Puppets", "Metallica"],
    ["Fade to Black", "Metallica"],
    ["For Whom the Bell Tolls", "Metallica"],
    ["Crazy Train", "Ozzy Osbourne"],
    ["Bark at the Moon", "Ozzy Osbourne"],
    ["Holy Diver", "Dio"],
    ["Rainbow in the Dark", "Dio"],
    ["Ace of Spades", "Motörhead"],
    ["Breaking the Law", "Judas Priest"],
    ["Living After Midnight", "Judas Priest"],
    ["You've Got Another Thing Comin'", "Judas Priest"],
    ["Run to the Hills", "Iron Maiden"],
    ["The Trooper", "Iron Maiden"],
    ["The Number of the Beast", "Iron Maiden"],
    ["2 Minutes to Midnight", "Iron Maiden"],
    ["Rock You Like a Hurricane", "Scorpions"],
    ["Still Loving You", "Scorpions"],
    ["No One Like You", "Scorpions"],
  ],
  "Soul / Funk": [
    ["Let's Groove", "Earth, Wind & Fire"],
    ["Boogie Wonderland", "Earth, Wind & Fire"],
    ["Sexual Healing", "Marvin Gaye"],
    ["Ain't Nobody", "Chaka Khan"],
    ["I Feel for You", "Chaka Khan"],
    ["Forget Me Nots", "Patrice Rushen"],
    ["You Dropped a Bomb on Me", "The Gap Band"],
    ["Early in the Morning", "The Gap Band"],
    ["Super Freak", "Rick James"],
    ["Give It to Me Baby", "Rick James"],
    ["Cold Blooded", "Rick James"],
    ["Square Biz", "Teena Marie"],
    ["Lovergirl", "Teena Marie"],
    ["Word Up!", "Cameo"],
    ["Candy", "Cameo"],
    ["And the Beat Goes On", "The Whispers"],
    ["Rock Steady", "The Whispers"],
    ["Juicy Fruit", "Mtume"],
    ["Never Knew Love Like This Before", "Stephanie Mills"],
    ["Give Me the Night", "George Benson"],
  ],
  "Indie / Alternative": [
    ["How Soon Is Now?", "The Smiths"],
    ["This Charming Man", "The Smiths"],
    ["There Is a Light That Never Goes Out", "The Smiths"],
    ["Love Will Tear Us Apart", "Joy Division"],
    ["Just Like Heaven", "The Cure"],
    ["Lovesong", "The Cure"],
    ["Lullaby", "The Cure"],
    ["In Between Days", "The Cure"],
    ["Close to Me", "The Cure"],
    ["Burning Down the House", "Talking Heads"],
    ["Once in a Lifetime", "Talking Heads"],
    ["Everybody Wants to Rule the World", "Tears for Fears"],
    ["Shout", "Tears for Fears"],
    ["Mad World", "Tears for Fears"],
    ["Don't You (Forget About Me)", "Simple Minds"],
    ["Alive and Kicking", "Simple Minds"],
    ["Under the Milky Way", "The Church"],
    ["Where Is My Mind?", "Pixies"],
    ["Here Comes Your Man", "Pixies"],
  ],
  Blues: [
    ["Pride and Joy", "Stevie Ray Vaughan"],
    ["Crossfire", "Stevie Ray Vaughan"],
    ["The House Is Rockin'", "Stevie Ray Vaughan"],
    ["Cold Shot", "Stevie Ray Vaughan"],
    ["Pretending", "Eric Clapton"],
    ["Bad Love", "Eric Clapton"],
    ["Forever Man", "Eric Clapton"],
  ],
  "Gospel / Christian": [
    ["We Are the World", "USA for Africa"],
    ["That's What Friends Are For", "Dionne"],
    ["Higher Love", "Steve Winwood"],
    ["Lean on Me", "Club Nouveau"],
    ["Man in the Mirror", "Michael Jackson"],
    ["One Moment in Time", "Whitney Houston"],
    ["I Knew You Were Waiting (For Me)", "Aretha"],
    ["Put a Little Love in Your Heart", "Annie Lennox"],
  ],
  "Afrobeat / Amapiano": [
    ["You Can Call Me Al", "Paul Simon"],
    ["Graceland", "Paul Simon"],
    ["Diamonds on the Soles of Her Shoes", "Paul Simon"],
    ["The Boy in the Bubble", "Paul Simon"],
    ["Homeless", "Paul Simon"],
    ["Yé ké yé ké", "Mory Kanté"],
    ["Don't Go Lose It Baby", "Hugh Masekela"],
  ],
  "K-Pop": [], // Japanese city pop ≠ international 80s A-list hits
  "Folk / Acoustic": [
    ["Fast Car", "Tracy Chapman"],
    ["Talkin' 'bout a Revolution", "Tracy Chapman"],
    ["Baby Can I Hold You", "Tracy Chapman"],
    ["Luka", "Suzanne Vega"],
    ["Tom's Diner", "Suzanne Vega"],
    ["You Can Call Me Al", "Paul Simon"],
    ["Graceland", "Paul Simon"],
  ],
  Disco: [
    ["Upside Down", "Diana Ross"],
    ["I'm Coming Out", "Diana Ross"],
    ["Celebration", "Kool & the Gang"],
    ["Get Down on It", "Kool & the Gang"],
    ["Cherish", "Kool & the Gang"],
    ["Funky Town", "Lipps Inc."],
    ["Funkytown", "Lipps Inc."],
    ["She Works Hard for the Money", "Donna Summer"],
    ["This Time I Know It's for Real", "Donna Summer"],
    ["Let's Groove", "Earth, Wind & Fire"],
    ["Boogie Wonderland", "Earth, Wind & Fire"],
    ["Another One Bites the Dust", "Queen"],
    ["Word Up!", "Cameo"],
    ["Candy", "Cameo"],
    ["Forget Me Nots", "Patrice Rushen"],
    ["Take Your Time (Do It Right)", "S.O.S. Band"],
    ["Just Be Good to Me", "S.O.S. Band"],
    ["Genius of Love", "Tom Tom Club"],
  ],
  "New Age / Ambient": [
    ["Orinoco Flow", "Enya"],
    ["Moonlight Shadow", "Mike Oldfield"],
    ["Chariots of Fire", "Vangelis"],
    ["Oxygène Part 4", "Jean-Michel Jarre"],
    ["Fourth Rendez-Vous", "Jean-Michel Jarre"],
  ],
};

/** Tracks to drop from major shelves (not A-list international megahits). */
const DENY = {
  Pop: new Set(
    [
      // soft / secondary cuts kept out of A-list bar
    ].map(([t, a]) => key(t, a)),
  ),
  Rock: new Set(
    [
      ["Nightrain", "Guns N' Roses"],
      ["And the Cradle Will Rock...", "Van Halen"],
      ["Shoot to Thrill", "AC/DC"],
      ["For Those About to Rock", "AC/DC"],
      ["Hysteria", "Def Leppard"], // album title track, not the smash singles
      ["Still of the Night", "Whitesnake"],
      ["Brothers in Arms", "Dire Straits"], // album cut vs Money for Nothing
      ["Romeo and Juliet", "Dire Straits"],
      ["Bad", "U2"],
      ["Shadows of the Night", "Pat Benatar"],
      ["Fire and Ice", "Pat Benatar"],
      ["Authority Song", "John Mellencamp"],
      ["Cherry Bomb", "John Mellencamp"],
      ["Waiting on a Friend", "The Rolling Stones"],
      ["Undercover of the Night", "The Rolling Stones"],
      ["Dancing with Myself", "Billy Idol"],
      ["Sleeping Bag", "ZZ Top"],
      ["Bang Your Head (Metal Health)", "Quiet Riot"],
      ["Lay It Down", "Ratt"],
      ["Talk Dirty to Me", "Poison"],
      ["No One Like You", "Scorpions"],
      ["Big City Nights", "Scorpions"],
      ["Refugee", "Tom Petty"],
      ["The Waiting", "Tom Petty"],
      ["Love Removal Machine", "The Cult"],
      ["Mr. Crowley", "Ozzy Osbourne"],
      ["Wild Side", "Mötley Crüe"],
      ["Crossfire", "Stevie Ray Vaughan"],
      ["Some Kind of Wonderful", "Huey Lewis and the News"],
      ["Do You Believe in Love", "Huey Lewis and the News"],
      ["Jacob's Ladder", "Huey Lewis and the News"],
      ["If This Is It", "Huey Lewis and the News"],
      ["Come Dancing", "The Kinks"],
      ["Born to Be My Baby", "Bon Jovi"],
      ["Who's Crying Now", "Journey"],
      ["Tunnel of Love", "Bruce Springsteen"],
      ["And She Was", "Talking Heads"],
      ["Wild Wild Life", "Talking Heads"],
      ["Road to Nowhere", "Talking Heads"],
    ].map(([t, a]) => key(t, a)),
  ),
  "Hip-Hop / Rap": new Set(
    [
      ["Christmas Rappin'", "Kurtis Blow"],
      ["Apache", "The Sugarhill Gang"],
      ["Sucker M.C.'s", "Run-D.M.C."],
      ["Mary, Mary", "Run-D.M.C."],
      ["You Be Illin'", "Run-D.M.C."],
      ["My Adidas", "Run-D.M.C."],
      ["Tramp", "Salt-N-Pepa"],
      ["A Nightmare on My Street", "DJ Jazzy Jeff"],
      ["Girls Ain't Nothing but Trouble", "DJ Jazzy Jeff"],
      ["Holiday Rap", "MC Miker G"],
      ["Black Steel in the Hour of Chaos", "Public Enemy"],
      ["Night of the Living Baseheads", "Public Enemy"],
      ["Lyrics of Fury", "Eric B. & Rakim"],
      ["My Melody", "Eric B. & Rakim"],
      ["I Ain't No Joke", "Eric B. & Rakim"],
      ["Set It Off", "Big Daddy Kane"],
      ["The Bridge", "MC Shan"],
      ["I'm Still #1", "Boogie Down Productions"],
      ["It's My Thing", "EPMD"],
      ["So What Cha Sayin'", "EPMD"],
      ["Vapors", "Biz Markie"],
      ["Make the Music with Your Mouth, Biz", "Biz Markie"],
      ["I Got It Made", "Special Ed"],
      ["Go See the Doctor", "Kool Moe Dee"],
      ["I Go to Work", "Kool Moe Dee"],
      ["They Want Money", "Kool Moe Dee"],
      ["Roxanne's Revenge", "Roxanne Shanté"],
      ["It's Yours", "T La Rock"],
      ["Looking Down the Barrel of a Gun", "Beastie Boys"],
      ["Shadrach", "Beastie Boys"],
      ["Shake Your Rump", "Beastie Boys"],
      ["The New Style", "Beastie Boys"],
      ["Hold It Now, Hit It", "Beastie Boys"],
      ["Big Ole Butt", "LL Cool J"],
      ["Jingling Baby", "LL Cool J"],
      ["Around the Way Girl", "LL Cool J"], // charted 1990
      ["Dopeman", "N.W.A"],
      ["The Formula", "The D.O.C."],
      ["It's Funky Enough", "The D.O.C."],
      ["We're All in the Same Gang", "West Coast Rap"],
      ["Principal's Office", "Young MC"],
      ["Me So Horny", "2 Live Crew"],
    ].map(([t, a]) => key(t, a)),
  ),
  "R&B": new Set(
    [
      ["Overjoyed", "Stevie Wonder"],
      ["That Girl", "Stevie Wonder"],
      ["All at Once", "Whitney Houston"],
      ["Typical Male", "Tina Turner"],
      ["Through the Fire", "Chaka Khan"],
      ["Any Love", "Luther Vandross"],
      ["Give Me the Reason", "Luther Vandross"],
      ["Just Because", "Anita Baker"],
      ["Caught Up in the Rapture", "Anita Baker"],
      ["Mr. Telephone Man", "New Edition"],
      ["Candy Girl", "New Edition"],
      ["Rock Me Tonight", "Freddie Jackson"],
      ["You Are My Lady", "Freddie Jackson"],
      ["Burn Rubber on Me", "The Gap Band"],
      ["Between the Sheets", "The Isley Brothers"],
      ["Caravan of Love", "Isley-Jasper-Isley"],
      ["Solid", "Ashford & Simpson"],
      ["On the Wings of Love", "Jeffrey Osborne"],
      ["Roni", "Bobby Brown"],
      ["Let's Wait Awhile", "Janet Jackson"],
      ["The Pleasure Principle", "Janet Jackson"],
      ["Escapade", "Janet Jackson"], // 1990 single
      ["And I Am Telling You I'm Not Going", "Jennifer Holliday"],
      ["One Hundred Ways", "James Ingram"],
      ["Love Come Down", "Evelyn Champagne King"],
    ].map(([t, a]) => key(t, a)),
  ),
  "Electronic / Dance": new Set(
    [
      ["Ceremony", "New Order"],
      ["The Perfect Kiss", "New Order"],
      ["Temptation", "New Order"],
      ["Mirror Man", "The Human League"],
      ["Missionary Man", "Eurythmics"],
      ["Master and Servant", "Depeche Mode"],
      ["Everything Counts", "Depeche Mode"],
      ["Souvenir", "Orchestral Manoeuvres in the Dark"],
      ["Maid of Orleans", "Orchestral Manoeuvres in the Dark"],
      ["Welcome to the Pleasuredome", "Frankie Goes to Hollywood"],
      ["You Came", "Kim Wilde"],
      ["Fade to Grey", "Visage"],
      ["Atmosphere", "Joy Division"],
      ["How Soon Is Now?", "The Smiths"],
      ["This Charming Man", "The Smiths"],
      ["There Is a Light That Never Goes Out", "The Smiths"],
      ["Radioactivity", "Kraftwerk"],
      ["Tour de France", "Kraftwerk"],
      ["Chase", "Giorgio Moroder"],
      ["In Your Eyes", "Peter Gabriel"],
      ["Big Time", "Peter Gabriel"],
      ["What You Need", "INXS"],
      ["Devil Inside", "INXS"],
    ].map(([t, a]) => key(t, a)),
  ),
  Reggae: new Set(
    [
      // not 80s international megahits / wrong decade / deep cuts
      ["Boombastic", "Shaggy"], // 1995
      ["Sweat (A La La La La Long)", "Inner Circle"], // 1992
      ["Murder She Wrote", "Chaka Demus"], // early 90s
      ["Jamming", "Bob Marley"], // 1977
      ["No Woman, No Cry", "Bob Marley"], // 1974/75
      ["Stir It Up", "Bob Marley"], // 1973
      ["Get Up, Stand Up", "Bob Marley"], // 1973
      ["Exodus", "Bob Marley"], // 1977
      ["Waiting in Vain", "Bob Marley"], // 1977
      ["Satisfy My Soul", "Bob Marley"], // 1978
      ["Positive Vibration", "Bob Marley"], // 1976
      ["Punky Reggae Party", "Bob Marley"],
      ["Natural Mystic", "Bob Marley"],
      ["So Much Trouble in the World", "Bob Marley"],
      ["Survival", "Bob Marley"],
      ["Africa Unite", "Bob Marley"],
      ["One Drop", "Bob Marley"],
      ["Zimbabwe", "Bob Marley"],
      ["Equal Rights", "Peter Tosh"],
      ["No Nuclear War", "Peter Tosh"],
      ["Legalize It", "Peter Tosh"],
      ["Bush Doctor", "Peter Tosh"],
      ["African", "Peter Tosh"],
      ["Mystic Man", "Peter Tosh"],
      ["Cool Down the Pace", "Gregory Isaacs"],
      ["Zungguzungguguzungguzeng", "Yellowman"],
      ["Nobody Move, Nobody Get Hurt", "Yellowman"],
      ["Wa-Do-Dem", "Eek-A-Mouse"],
      ["Anarexol", "Eek-A-Mouse"],
      ["Transport Connection", "Sister Nancy"],
      ["One Two", "Sister Nancy"],
      ["Pass the Tu-Sheng Peng", "Frankie Paul"],
      ["Sara", "Frankie Paul"],
      ["Police and Thieves", "Junior Murvin"], // 1976
      ["Chase the Devil", "Max Romeo"], // 1976
      ["54-46 Was My Number", "Toots"],
      ["Funky Kingston", "Toots"],
      ["Monkey Man", "Toots"],
      ["Pressure Drop", "Toots"],
      ["Feel Like Jumping", "Marcia Griffiths"],
      ["Stepping Out of Babylon", "Marcia Griffiths"],
      ["Revolution", "Dennis Brown"],
      ["Love Has Found Its Way", "Dennis Brown"],
      ["Under Mi Sensi", "Barrington Levy"],
      ["Here I Come", "Barrington Levy"],
      ["If It Happens Again", "UB40"],
      ["Sing Our Own Song", "UB40"],
      ["Don't Break My Heart", "UB40"],
      ["Youth of Today", "Musical Youth"],
      ["On My Radio", "The Selecter"],
      ["The Lunatics (Have Taken Over the Asylum)", "Fun Boy Three"],
      ["A Message to You Rudy", "The Specials"],
      ["Uptown Top Ranking", "Althea"],
      ["Silly Games", "Janet Kay"],
      ["(You Gotta Walk) Don't Look Back", "Peter Tosh"],
      ["Don't Look Back", "Peter Tosh"],
      ["Johnny B. Goode", "Peter Tosh"],
      ["Under Mi Sleng Teng", "Wayne Smith"],
      ["Ring the Alarm", "Tenor Saw"],
      ["Bam Bam", "Sister Nancy"],
      ["Bad Boys", "Inner Circle"], // international hit was early 90s Cops theme push
    ].map(([t, a]) => key(t, a)),
  ),
};

function matchesAllow(title, artist, pairs) {
  const nt = norm(title);
  const na = norm(artist);
  return pairs.some(([t, a]) => {
    const pt = norm(t);
    const pa = norm(a);
    return (nt === pt || nt.includes(pt) || pt.includes(nt)) && na.includes(pa);
  });
}

function isDenied(genre, title, artist) {
  const deny = DENY[genre];
  if (!deny || deny.size === 0) return false;
  const k = key(title, artist);
  if (deny.has(k)) return true;
  // loose: any deny key with same title and artist substring
  for (const d of deny) {
    const [dt, da] = d.split("|");
    if (norm(title) === dt && norm(artist).includes(da.split(" ")[0])) return true;
  }
  return false;
}

/** @param {Row[]} rows @param {string} genre */
function pruneRows(rows, genre) {
  const allow = KEEP[genre];
  let out = rows.filter((row) => {
    const [title, artist, year] = row;
    if (typeof year !== "number" || year < 1980 || year > 1989) return false;
    if (isDenied(genre, title, artist)) return false;
    if (Array.isArray(allow)) {
      if (allow.length === 0) return false;
      return matchesAllow(title, artist, allow);
    }
    return true;
  });

  // Dedupe
  const seen = new Set();
  out = out.filter(([title, artist]) => {
    const k = key(title, artist);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeSeed(file, rows) {
  fs.writeFileSync(file, JSON.stringify(rows) + "\n");
}

const SEED_FILES = {
  Pop: path.join(dataDir, "_pop.json"),
  Rock: path.join(dataDir, "_rock.json"),
  "Hip-Hop / Rap": path.join(seedsDir, "hiphop.json"),
  "R&B": path.join(seedsDir, "rnb.json"),
  "Electronic / Dance": path.join(seedsDir, "electronic.json"),
  Jazz: path.join(seedsDir, "jazz.json"),
  Country: path.join(seedsDir, "country.json"),
  Classical: path.join(seedsDir, "classical.json"),
  Reggae: path.join(seedsDir, "reggae.json"),
  "Latin Music": path.join(seedsDir, "latin.json"),
  Metal: path.join(seedsDir, "metal.json"),
  "Soul / Funk": path.join(seedsDir, "soul-funk.json"),
  "Indie / Alternative": path.join(seedsDir, "indie.json"),
  Blues: path.join(seedsDir, "blues.json"),
  "Gospel / Christian": path.join(seedsDir, "gospel.json"),
  "Afrobeat / Amapiano": path.join(seedsDir, "afrobeat.json"),
  "K-Pop": path.join(seedsDir, "kpop.json"),
  "Folk / Acoustic": path.join(seedsDir, "folk.json"),
  Disco: path.join(seedsDir, "disco.json"),
  "New Age / Ambient": path.join(seedsDir, "ambient.json"),
};

let removed = 0;
let kept = 0;
for (const [genre, file] of Object.entries(SEED_FILES)) {
  const before = readJson(file);
  const after = pruneRows(before, genre);
  const dropped = before.length - after.length;
  removed += dropped;
  kept += after.length;
  writeSeed(file, after);
  console.log(
    `${String(after.length).padStart(3)} keep / ${String(dropped).padStart(3)} drop  ${genre}`,
  );
}

console.log(`\nKept ${kept}, removed ${removed}`);
