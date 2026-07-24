/**
 * Curate seed catalogs to ≤600 top A-list late-70s / 80s megahits.
 *
 * Run: node scripts/curate-top600.mjs && node scripts/build-catalog.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const seedsDir = path.join(dataDir, "_seeds");

const MAX_TRACKS = 600;
const YEAR_MIN = 1977;
const YEAR_MAX = 1989;
const MAX_PER_ARTIST = 10;

/** @typedef {[string, string, number, string]} Row */

function norm(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[''']/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function artistKey(artist) {
  return norm(artist)
    .replace(/^the /, "")
    .replace(/ & the wailers$/, "")
    .replace(/ and the news$/, "");
}

function trackKey(title, artist) {
  return `${norm(title)}|${artistKey(artist)}`;
}

/** Tier-1 household-name artists of the late 70s / 80s. */
const TIER1 = [
  "Michael Jackson",
  "Madonna",
  "Prince",
  "Whitney Houston",
  "Queen",
  "Madonna",
  "Phil Collins",
  "Genesis",
  "Lionel Richie",
  "Duran Duran",
  "a-ha",
  "Cyndi Lauper",
  "Culture Club",
  "Wham!",
  "George Michael",
  "Pet Shop Boys",
  "Eurythmics",
  "Tears for Fears",
  "Simple Minds",
  "U2",
  "Bruce Springsteen",
  "Bon Jovi",
  "Guns N' Roses",
  "Van Halen",
  "AC/DC",
  "Def Leppard",
  "Journey",
  "Foreigner",
  "REO Speedwagon",
  "Survivor",
  "Europe",
  "Aerosmith",
  "Billy Joel",
  "Elton John",
  "Stevie Wonder",
  "Tina Turner",
  "Diana Ross",
  "Janet Jackson",
  "Luther Vandross",
  "Anita Baker",
  "Aretha Franklin",
  "Earth, Wind & Fire",
  "Kool & the Gang",
  "Chaka Khan",
  "Rick James",
  "Cameo",
  "Prince",
  "The Police",
  "Sting",
  "Dire Straits",
  "The Rolling Stones",
  "David Bowie",
  "Blondie",
  "The Cure",
  "Depeche Mode",
  "New Order",
  "The Human League",
  "Soft Cell",
  "Frankie Goes to Hollywood",
  "INXS",
  "R.E.M.",
  "The Smiths",
  "Talking Heads",
  "Run-D.M.C.",
  "Beastie Boys",
  "Public Enemy",
  "LL Cool J",
  "Salt-N-Pepa",
  "Tone Loc",
  "Young MC",
  "N.W.A",
  "Metallica",
  "Iron Maiden",
  "Ozzy Osbourne",
  "Scorpions",
  "Judas Priest",
  "Motörhead",
  "Dio",
  "Bob Marley",
  "UB40",
  "The Specials",
  "Gloria Estefan",
  "Los Lobos",
  "Kenny Rogers",
  "Dolly Parton",
  "ABBA",
  "Bee Gees",
  "Boney M.",
  "Donna Summer",
  "Village People",
  "Lipps Inc.",
  "Kim Carnes",
  "Irene Cara",
  "Berlin",
  "Starship",
  "Mr. Mister",
  "Cutting Crew",
  "Rick Astley",
  "Bananarama",
  "Dead or Alive",
  "Kajagoogoo",
  "Men at Work",
  "Men Without Hats",
  "Tommy Tutone",
  "Soft Cell",
  "Hall & Oates",
  "Huey Lewis",
  "John Mellencamp",
  "Tom Petty",
  "Bryan Adams",
  "Chris de Burgh",
  "Peter Gabriel",
  "Kate Bush",
  "Sade",
  "Tracy Chapman",
  "Paul Simon",
  "Billy Idol",
  "Pat Benatar",
  "Joan Jett",
  "Heart",
  "Yes",
  "Asia",
  "The Bangles",
  "The Go-Go's",
  "Pointer Sisters",
  "Patti LaBelle",
  "Stephanie Mills",
  "New Edition",
  "Bobby Brown",
  "Alexander O'Neal",
  "Ready for the World",
  "Force MDs",
  "Lisa Lisa",
  "Shannon",
  "Rockwell",
  "Ray Parker Jr.",
  "Ghostbusters",
  "Kenny Loggins",
  "Joe Esposito",
  "Bonnie Tyler",
  "Joe Cocker",
  "Jennifer Warnes",
  "Berlin",
  "A-ha",
  "Alphaville",
  "Modern Talking",
  "Falco",
  "Nena",
  "Trio",
  "Kraftwerk",
  "Jean-Michel Jarre",
  "Vangelis",
  "Mike Oldfield",
  "Enya",
  "Herbie Hancock",
  "George Benson",
  "Al Jarreau",
  "Kenny G",
  "Stevie Ray Vaughan",
  "Eric Clapton",
  "ZZ Top",
  "Mötley Crüe",
  "Poison",
  "Quiet Riot",
  "Twisted Sister",
  "Whitesnake",
  "Ratt",
  "The Cult",
  "Pixies",
  "Joy Division",
  "Orchestral Manoeuvres in the Dark",
  "OMD",
  "Erasure",
  "Bronski Beat",
  "Communards",
  "Spandau Ballet",
  "Ultravox",
  "Visage",
  "Adam and the Ants",
  "Adam Ant",
  "Culture Club",
  "Howard Jones",
  "Nik Kershaw",
  "Wang Chung",
  "Level 42",
  "Simply Red",
  "Wet Wet Wet",
  "Swing Out Sister",
  "Johnny Hates Jazz",
  "Curiosity Killed the Cat",
  "Fine Young Cannibals",
  "Was (Not Was)",
  "Robert Palmer",
  "Steve Winwood",
  "Eddie Money",
  "Night Ranger",
  "Loverboy",
  "Quarterflash",
  "The Motels",
  "Missing Persons",
  "Toto",
  "Chicago",
  "Air Supply",
  "Christopher Cross",
  "Sheena Easton",
  "Olivia Newton-John",
  "Laura Branigan",
  "Kim Wilde",
  "Samantha Fox",
  "Tiffany",
  "Debbie Gibson",
  "Belinda Carlisle",
  "Exposé",
  "Lisa Stansfield",
  "Soul II Soul",
  "Technotronic",
  "Rob Base",
  "Milli Vanilli",
  "Snap!",
  "Black Box",
  "Inner City",
  "C+C Music Factory",
  "Musical Youth",
  "Gregory Isaacs",
  "Marcia Griffiths",
  "Eddy Grant",
  "Third World",
  "Black Uhuru",
  "Aswad",
  "Maxi Priest",
  "Gipsy Kings",
  "Julio Iglesias",
  "Miami Sound Machine",
  "Willie Nelson",
  "Oak Ridge Boys",
  "Eddie Rabbitt",
  "Randy Travis",
  "John Williams",
  "Harold Faltermeyer",
  "Jan Hammer",
  "Giorgio Moroder",
  "Bill Conti",
  "Survivor",
  "Kenny Loggins",
  "USA for Africa",
  "Band Aid",
  "Club Nouveau",
  "Billy Ocean",
  "Jeffrey Osborne",
  "Peabo Bryson",
  "James Ingram",
  "Michael McDonald",
  "Christopher Cross",
  "Amy Grant",
  "S.O.S. Band",
  "The Gap Band",
  "The Whispers",
  "Mtume",
  "Teena Marie",
  "Patrice Rushen",
  "Evelyn Champagne King",
  "The Isley Brothers",
  "Ashford & Simpson",
  "Freddie Jackson",
  "Loose Ends",
  "Five Star",
  "Shalamar",
  "Change",
  "Imagination",
  "Kool Moe Dee",
  "Eric B. & Rakim",
  "Big Daddy Kane",
  "Boogie Down Productions",
  "Kurtis Blow",
  "The Sugarhill Gang",
  "Grandmaster Flash",
  "DJ Jazzy Jeff",
  "MC Hammer",
  "Vanilla Ice",
  "Digital Underground",
  "Queen Latifah",
  "De La Soul",
  "A Tribe Called Quest",
  "Tom Tom Club",
  "Yello",
  "Art of Noise",
  "Freeez",
  "Shannon",
  "Indeep",
  "Rockers Revenge",
  "Cerrone",
  "Chic",
  "Sister Sledge",
  "Nile Rodgers",
  "Grace Jones",
  "Talk Talk",
  "Japan",
  "Roxy Music",
  "Bryan Ferry",
  "ABC",
  "Heaven 17",
  "Thomas Dolby",
  "Gary Numan",
  "John Foxx",
  "Ultravox",
  "Icehouse",
  "Split Enz",
  "Crowded House",
  "Midnight Oil",
  "INXS",
  "Divinyls",
  "Men at Work",
  "Pseudo Echo",
  "John Farnham",
  "Rick Springfield",
  "Air Supply",
  "Little River Band",
  "Joe Jackson",
  "Elvis Costello",
  "The Clash",
  "The Jam",
  "The Pretenders",
  "Siouxsie",
  "Bauhaus",
  "Echo & the Bunnymen",
  "The Psychedelic Furs",
  "Modern English",
  "A Flock of Seagulls",
  "The Church",
  "Suzanne Vega",
  "10,000 Maniacs",
  "Camper Van Beethoven",
  "Violent Femmes",
  "They Might Be Giants",
  "XTC",
  "Squeeze",
  "Joe Jackson",
  "Paul Young",
  "Alison Moyet",
  "Yazoo",
  "Yaz",
  "Annie Lennox",
  "Dave Stewart",
  "Mike + The Mechanics",
  "Genesis",
  "Yes",
  "Marillion",
  "Rush",
  "King Crimson",
  "Jethro Tull",
  "Supertramp",
  "The Alan Parsons Project",
  "Electric Light Orchestra",
  "ELO",
  "Jeff Lynne",
  "Traveling Wilburys",
  "Roy Orbison",
  "George Harrison",
  "Paul McCartney",
  "John Lennon",
  "Ringo Starr",
  "The Beatles",
].map(artistKey);

const TIER1_SET = new Set(TIER1);

/**
 * Golden late-70s / 80s must-keeps (title + artist substring).
 * Ensured even if artist scoring would drop them under the cap.
 */
const MUST_KEEP = [
  // Michael Jackson / Madonna / Prince
  ["Billie Jean", "Michael Jackson"],
  ["Thriller", "Michael Jackson"],
  ["Beat It", "Michael Jackson"],
  ["Smooth Criminal", "Michael Jackson"],
  ["Bad", "Michael Jackson"],
  ["The Way You Make Me Feel", "Michael Jackson"],
  ["Man in the Mirror", "Michael Jackson"],
  ["Dirty Diana", "Michael Jackson"],
  ["Wanna Be Startin' Somethin'", "Michael Jackson"],
  ["Rock With You", "Michael Jackson"],
  ["Don't Stop 'Til You Get Enough", "Michael Jackson"],
  ["Like a Virgin", "Madonna"],
  ["Material Girl", "Madonna"],
  ["Like a Prayer", "Madonna"],
  ["Papa Don't Preach", "Madonna"],
  ["Into the Groove", "Madonna"],
  ["Holiday", "Madonna"],
  ["La Isla Bonita", "Madonna"],
  ["Vogue", "Madonna"],
  ["When Doves Cry", "Prince"],
  ["Purple Rain", "Prince"],
  ["Kiss", "Prince"],
  ["Little Red Corvette", "Prince"],
  ["1999", "Prince"],
  ["Raspberry Beret", "Prince"],
  ["Let's Go Crazy", "Prince"],
  // Late 70s golden
  ["Stayin' Alive", "Bee Gees"],
  ["Night Fever", "Bee Gees"],
  ["How Deep Is Your Love", "Bee Gees"],
  ["Tragedy", "Bee Gees"],
  ["Dancing Queen", "ABBA"],
  ["Mamma Mia", "ABBA"],
  ["Take a Chance on Me", "ABBA"],
  ["Gimme! Gimme! Gimme! (A Man After Midnight)", "ABBA"],
  ["The Winner Takes It All", "ABBA"],
  ["Super Trouper", "ABBA"],
  ["Rasputin", "Boney M."],
  ["Rivers of Babylon", "Boney M."],
  ["Daddy Cool", "Boney M."],
  ["Ma Baker", "Boney M."],
  ["I Will Survive", "Gloria Gaynor"],
  ["Y.M.C.A.", "Village People"],
  ["Le Freak", "Chic"],
  ["Good Times", "Chic"],
  ["We Are Family", "Sister Sledge"],
  ["Hot Stuff", "Donna Summer"],
  ["Bad Girls", "Donna Summer"],
  ["I Feel Love", "Donna Summer"],
  ["Boogie Wonderland", "Earth, Wind & Fire"],
  ["September", "Earth, Wind & Fire"],
  ["Let's Groove", "Earth, Wind & Fire"],
  ["Another Brick in the Wall", "Pink Floyd"],
  ["Hotel California", "Eagles"],
  ["Dreams", "Fleetwood Mac"],
  ["Go Your Own Way", "Fleetwood Mac"],
  ["Don't Stop", "Fleetwood Mac"],
  ["We Will Rock You", "Queen"],
  ["We Are the Champions", "Queen"],
  ["Another One Bites the Dust", "Queen"],
  ["Crazy Little Thing Called Love", "Queen"],
  ["Under Pressure", "Queen"],
  ["Radio Ga Ga", "Queen"],
  ["I Want to Break Free", "Queen"],
  ["Bohemian Rhapsody", "Queen"],
  ["Highway to Hell", "AC/DC"],
  ["You Shook Me All Night Long", "AC/DC"],
  ["Back in Black", "AC/DC"],
  ["Could You Be Loved", "Bob Marley"],
  ["Three Little Birds", "Bob Marley"],
  ["Redemption Song", "Bob Marley"],
  ["Buffalo Soldier", "Bob Marley"],
  ["Is This Love", "Bob Marley"],
  ["One Love", "Bob Marley"],
  ["Jamming", "Bob Marley"],
  ["No Woman, No Cry", "Bob Marley"],
  ["Roxanne", "The Police"],
  ["Every Breath You Take", "The Police"],
  ["Message in a Bottle", "The Police"],
  ["Don't Stand So Close to Me", "The Police"],
  ["Walking on the Moon", "The Police"],
  ["Video Killed the Radio Star", "Buggles"],
  ["Heart of Glass", "Blondie"],
  ["Call Me", "Blondie"],
  ["The Tide Is High", "Blondie"],
  ["Rapture", "Blondie"],
  ["My Sharona", "The Knack"],
  ["Pop Muzik", "M"],
  // Core 80s gold
  ["Take On Me", "a-ha"],
  ["Billie Jean", "Michael Jackson"],
  ["Sweet Child o' Mine", "Guns N' Roses"],
  ["Welcome to the Jungle", "Guns N' Roses"],
  ["Livin' on a Prayer", "Bon Jovi"],
  ["You Give Love a Bad Name", "Bon Jovi"],
  ["Jump", "Van Halen"],
  ["Panama", "Van Halen"],
  ["Eye of the Tiger", "Survivor"],
  ["Final Countdown", "Europe"],
  ["Pour Some Sugar on Me", "Def Leppard"],
  ["Photograph", "Def Leppard"],
  ["Total Eclipse of the Heart", "Bonnie Tyler"],
  ["Holding Out for a Hero", "Bonnie Tyler"],
  ["Girls Just Want to Have Fun", "Cyndi Lauper"],
  ["Time After Time", "Cyndi Lauper"],
  ["True Colors", "Cyndi Lauper"],
  ["Karma Chameleon", "Culture Club"],
  ["Do You Really Want to Hurt Me", "Culture Club"],
  ["Wake Me Up Before You Go-Go", "Wham!"],
  ["Careless Whisper", "George Michael"],
  ["Faith", "George Michael"],
  ["Last Christmas", "Wham!"],
  ["I Wanna Dance with Somebody", "Whitney Houston"],
  ["Greatest Love of All", "Whitney Houston"],
  ["How Will I Know", "Whitney Houston"],
  ["I Will Always Love You", "Whitney Houston"],
  ["What's Love Got to Do with It", "Tina Turner"],
  ["The Best", "Tina Turner"],
  ["Private Dancer", "Tina Turner"],
  ["Hello", "Lionel Richie"],
  ["All Night Long", "Lionel Richie"],
  ["Say You, Say Me", "Lionel Richie"],
  ["Against All Odds", "Phil Collins"],
  ["In the Air Tonight", "Phil Collins"],
  ["Another Day in Paradise", "Phil Collins"],
  ["Sussudio", "Phil Collins"],
  ["Easy Lover", "Philip Bailey"],
  ["Invisible Touch", "Genesis"],
  ["Land of Confusion", "Genesis"],
  ["Everybody Wants to Rule the World", "Tears for Fears"],
  ["Shout", "Tears for Fears"],
  ["Mad World", "Tears for Fears"],
  ["Sweet Dreams (Are Made of This)", "Eurythmics"],
  ["Here Comes the Rain Again", "Eurythmics"],
  ["There Must Be an Angel", "Eurythmics"],
  ["Don't You (Forget About Me)", "Simple Minds"],
  ["Alive and Kicking", "Simple Minds"],
  ["With or Without You", "U2"],
  ["I Still Haven't Found What I'm Looking For", "U2"],
  ["Pride (In the Name of Love)", "U2"],
  ["Where the Streets Have No Name", "U2"],
  ["Born in the U.S.A.", "Bruce Springsteen"],
  ["Dancing in the Dark", "Bruce Springsteen"],
  ["Glory Days", "Bruce Springsteen"],
  ["Hungry Heart", "Bruce Springsteen"],
  ["Hungry Like the Wolf", "Duran Duran"],
  ["The Reflex", "Duran Duran"],
  ["Rio", "Duran Duran"],
  ["Ordinary World", "Duran Duran"],
  ["A View to a Kill", "Duran Duran"],
  ["West End Girls", "Pet Shop Boys"],
  ["It's a Sin", "Pet Shop Boys"],
  ["Always on My Mind", "Pet Shop Boys"],
  ["Tainted Love", "Soft Cell"],
  ["Don't You Want Me", "The Human League"],
  ["Blue Monday", "New Order"],
  ["Bizarre Love Triangle", "New Order"],
  ["Relax", "Frankie Goes to Hollywood"],
  ["Two Tribes", "Frankie Goes to Hollywood"],
  ["Enjoy the Silence", "Depeche Mode"],
  ["Personal Jesus", "Depeche Mode"],
  ["Just Can't Get Enough", "Depeche Mode"],
  ["Take My Breath Away", "Berlin"],
  ["Flashdance... What a Feeling", "Irene Cara"],
  ["Fame", "Irene Cara"],
  ["Ghostbusters", "Ray Parker Jr."],
  ["Footloose", "Kenny Loggins"],
  ["Danger Zone", "Kenny Loggins"],
  ["Up Where We Belong", "Joe Cocker"],
  ["(I've Had) The Time of My Life", "Bill Medley"],
  ["Endless Love", "Diana Ross"],
  ["Upside Down", "Diana Ross"],
  ["I'm Coming Out", "Diana Ross"],
  ["Celebration", "Kool & the Gang"],
  ["Get Down on It", "Kool & the Gang"],
  ["Cherish", "Kool & the Gang"],
  ["Funkytown", "Lipps Inc."],
  ["Sexual Healing", "Marvin Gaye"],
  ["Super Freak", "Rick James"],
  ["Ain't Nobody", "Chaka Khan"],
  ["I Feel for You", "Chaka Khan"],
  ["Word Up!", "Cameo"],
  ["Rockit", "Herbie Hancock"],
  ["Axel F", "Harold Faltermeyer"],
  ["Miami Vice Theme", "Jan Hammer"],
  ["Chariots of Fire", "Vangelis"],
  ["Africa", "Toto"],
  ["Rosanna", "Toto"],
  ["Hold the Line", "Toto"],
  ["Owner of a Lonely Heart", "Yes"],
  ["Heat of the Moment", "Asia"],
  ["Money for Nothing", "Dire Straits"],
  ["Walk of Life", "Dire Straits"],
  ["Sultans of Swing", "Dire Straits"],
  ["Let's Dance", "David Bowie"],
  ["Under Pressure", "David Bowie"],
  ["Modern Love", "David Bowie"],
  ["Ashes to Ashes", "David Bowie"],
  ["Start Me Up", "The Rolling Stones"],
  ["Emotional Rescue", "The Rolling Stones"],
  ["Miss You", "The Rolling Stones"],
  ["Walk This Way", "Run-D.M.C."],
  ["It's Tricky", "Run-D.M.C."],
  ["Push It", "Salt-N-Pepa"],
  ["Parents Just Don't Understand", "DJ Jazzy Jeff"],
  ["Fight the Power", "Public Enemy"],
  ["Straight Outta Compton", "N.W.A"],
  ["Wild Thing", "Tone Loc"],
  ["Bust a Move", "Young MC"],
  ["Girls", "Beastie Boys"],
  ["(You Gotta) Fight for Your Right (To Party!)", "Beastie Boys"],
  ["It's Like That", "Run-D.M.C."],
  ["The Message", "Grandmaster Flash"],
  ["Rapper's Delight", "Sugarhill"],
  ["One", "Metallica"],
  ["Master of Puppets", "Metallica"],
  ["Enter Sandman", "Metallica"],
  ["Crazy Train", "Ozzy Osbourne"],
  ["Run to the Hills", "Iron Maiden"],
  ["The Number of the Beast", "Iron Maiden"],
  ["Rock You Like a Hurricane", "Scorpions"],
  ["Wind of Change", "Scorpions"],
  ["Still Loving You", "Scorpions"],
  ["Here I Go Again", "Whitesnake"],
  ["Is This Love", "Whitesnake"],
  ["Home Sweet Home", "Mötley Crüe"],
  ["Girls, Girls, Girls", "Mötley Crüe"],
  ["Every Rose Has Its Thorn", "Poison"],
  ["Nothin' but a Good Time", "Poison"],
  ["Cum on Feel the Noize", "Quiet Riot"],
  ["We're Not Gonna Take It", "Twisted Sister"],
  ["I Love Rock 'n' Roll", "Joan Jett"],
  ["Rebel Yell", "Billy Idol"],
  ["White Wedding", "Billy Idol"],
  ["Love Is a Battlefield", "Pat Benatar"],
  ["Hit Me with Your Best Shot", "Pat Benatar"],
  ["Alone", "Heart"],
  ["These Dreams", "Heart"],
  ["What a Feeling", "Irene Cara"],
  ["Bette Davis Eyes", "Kim Carnes"],
  ["9 to 5", "Dolly Parton"],
  ["Islands in the Stream", "Kenny Rogers"],
  ["Red Red Wine", "UB40"],
  ["(I Can't Help) Falling in Love With You", "UB40"],
  ["Kingston Town", "UB40"],
  ["Ghost Town", "The Specials"],
  ["Pass the Dutchie", "Musical Youth"],
  ["Electric Avenue", "Eddy Grant"],
  ["Conga", "Gloria Estefan"],
  ["Rhythm Is Gonna Get You", "Gloria Estefan"],
  ["La Bamba", "Los Lobos"],
  ["Smooth Operator", "Sade"],
  ["The Sweetest Taboo", "Sade"],
  ["Fast Car", "Tracy Chapman"],
  ["You Can Call Me Al", "Paul Simon"],
  ["Graceland", "Paul Simon"],
  ["Need You Tonight", "INXS"],
  ["New Sensation", "INXS"],
  ["Never Gonna Give You Up", "Rick Astley"],
  ["Together Forever", "Rick Astley"],
  ["Don't Dream It's Over", "Crowded House"],
  ["Down Under", "Men at Work"],
  ["Who Can It Be Now?", "Men at Work"],
  ["The Safety Dance", "Men Without Hats"],
  ["867-5309/Jenny", "Tommy Tutone"],
  ["Jessie's Girl", "Rick Springfield"],
  ["Jack & Diane", "John Mellencamp"],
  ["Pink Houses", "John Mellencamp"],
  ["The Power of Love", "Huey Lewis"],
  ["I Want a New Drug", "Huey Lewis"],
  ["Hip to Be Square", "Huey Lewis"],
  ["Free Fallin'", "Tom Petty"],
  ["I Won't Back Down", "Tom Petty"],
  ["Summer of '69", "Bryan Adams"],
  ["Heaven", "Bryan Adams"],
  ["Run to You", "Bryan Adams"],
  ["Lady in Red", "Chris de Burgh"],
  ["Sledgehammer", "Peter Gabriel"],
  ["In Your Eyes", "Peter Gabriel"],
  ["Running Up That Hill", "Kate Bush"],
  ["Wuthering Heights", "Kate Bush"],
  ["Orinoco Flow", "Enya"],
  ["Moonlight Shadow", "Mike Oldfield"],
  ["Oxygène Part 4", "Jean-Michel Jarre"],
  ["99 Luftballons", "Nena"],
  ["Rock Me Amadeus", "Falco"],
  ["Big in Japan", "Alphaville"],
  ["Forever Young", "Alphaville"],
  ["The Final Countdown", "Europe"],
  ["We Are the World", "USA for Africa"],
  ["Do They Know It's Christmas?", "Band Aid"],
  ["When the Going Gets Tough", "Billy Ocean"],
  ["Caribbean Queen", "Billy Ocean"],
  ["Get Out of My Dreams", "Billy Ocean"],
  ["Higher Love", "Steve Winwood"],
  ["Valerie", "Steve Winwood"],
  ["Addicted to Love", "Robert Palmer"],
  ["Simply Irresistible", "Robert Palmer"],
  ["She Drives Me Crazy", "Fine Young Cannibals"],
  ["Good Thing", "Fine Young Cannibals"],
  ["Don't Worry Be Happy", "Bobby McFerrin"],
  ["Walk Like an Egyptian", "The Bangles"],
  ["Eternal Flame", "The Bangles"],
  ["Manic Monday", "The Bangles"],
  ["Our Lips Are Sealed", "The Go-Go's"],
  ["We Got the Beat", "The Go-Go's"],
  ["Vacation", "The Go-Go's"],
  ["I'm So Excited", "Pointer Sisters"],
  ["Jump (For My Love)", "Pointer Sisters"],
  ["Automatic", "Pointer Sisters"],
  ["Physical", "Olivia Newton-John"],
  ["Xanadu", "Olivia Newton-John"],
  ["Gloria", "Laura Branigan"],
  ["Self Control", "Laura Branigan"],
  ["True", "Spandau Ballet"],
  ["Gold", "Spandau Ballet"],
  ["Come On Eileen", "Dexys"],
  ["Our House", "Madness"],
  ["It Must Be Love", "Madness"],
  ["Baggy Trousers", "Madness"],
  ["Don't Leave Me This Way", "Communards"],
  ["Smalltown Boy", "Bronski Beat"],
  ["A Little Respect", "Erasure"],
  ["Sometimes", "Erasure"],
  ["Just Like Heaven", "The Cure"],
  ["Lovesong", "The Cure"],
  ["Lullaby", "The Cure"],
  ["Close to Me", "The Cure"],
  ["How Soon Is Now?", "The Smiths"],
  ["This Charming Man", "The Smiths"],
  ["There Is a Light That Never Goes Out", "The Smiths"],
  ["Burning Down the House", "Talking Heads"],
  ["Once in a Lifetime", "Talking Heads"],
  ["Love Will Tear Us Apart", "Joy Division"],
  ["Where Is My Mind?", "Pixies"],
  ["The One I Love", "R.E.M."],
  ["Losing My Religion", "R.E.M."],
  ["Stand", "R.E.M."],
  ["It's the End of the World as We Know It", "R.E.M."],
  ["Control", "Janet Jackson"],
  ["Nasty", "Janet Jackson"],
  ["When I Think of You", "Janet Jackson"],
  ["Miss You Much", "Janet Jackson"],
  ["Rhythm Nation", "Janet Jackson"],
  ["I Just Called to Say I Love You", "Stevie Wonder"],
  ["Part-Time Lover", "Stevie Wonder"],
  ["That Girl", "Stevie Wonder"],
  ["Ebony and Ivory", "Stevie Wonder"],
  ["Say Say Say", "Paul McCartney"],
  ["Coming Around Again", "Carly Simon"],
  ["You're So Vain", "Carly Simon"],
  ["Uptown Girl", "Billy Joel"],
  ["We Didn't Start the Fire", "Billy Joel"],
  ["Tell Her About It", "Billy Joel"],
  ["An Innocent Man", "Billy Joel"],
  ["I'm Still Standing", "Elton John"],
  ["I Guess That's Why They Call It the Blues", "Elton John"],
  ["Nikita", "Elton John"],
  ["Sacrifice", "Elton John"],
  ["Candle in the Wind", "Elton John"],
  ["All Out of Love", "Air Supply"],
  ["Making Love Out of Nothing at All", "Air Supply"],
  ["Hard to Say I'm Sorry", "Chicago"],
  ["You're the Inspiration", "Chicago"],
  ["Open Arms", "Journey"],
  ["Don't Stop Believin'", "Journey"],
  ["Faithfully", "Journey"],
  ["Separate Ways", "Journey"],
  ["Any Way You Want It", "Journey"],
  ["Waiting for a Girl Like You", "Foreigner"],
  ["I Want to Know What Love Is", "Foreigner"],
  ["Urgent", "Foreigner"],
  ["Juke Box Hero", "Foreigner"],
  ["Keep On Loving You", "REO Speedwagon"],
  ["Can't Fight This Feeling", "REO Speedwagon"],
  ["Jessie's Girl", "Rick Springfield"],
  ["Abracadabra", "Steve Miller"],
  ["Centerfold", "The J. Geils Band"],
  ["Freeze-Frame", "The J. Geils Band"],
  ["Whip It", "Devo"],
  ["Rock the Casbah", "The Clash"],
  ["Should I Stay or Should I Go", "The Clash"],
  ["London Calling", "The Clash"],
  ["Brass in Pocket", "The Pretenders"],
  ["Back on the Chain Gang", "The Pretenders"],
  ["Don't Get Me Wrong", "The Pretenders"],
  ["Pride and Joy", "Stevie Ray Vaughan"],
  ["Crossfire", "Stevie Ray Vaughan"],
  ["Legs", "ZZ Top"],
  ["Sharp Dressed Man", "ZZ Top"],
  ["Gimme All Your Lovin'", "ZZ Top"],
  ["Got My Mind Set on You", "George Harrison"],
  ["Handle with Care", "Traveling Wilburys"],
  ["End of the Line", "Traveling Wilburys"],
  ["La Bamba", "Los Lobos"],
  ["Broken Wings", "Mr. Mister"],
  ["Kyrie", "Mr. Mister"],
  ["We Built This City", "Starship"],
  ["Nothing's Gonna Stop Us Now", "Starship"],
  ["Sara", "Starship"],
  ["Alone", "Heart"],
  ["The Power of Love", "Jennifer Rush"],
  ["Right Here Waiting", "Richard Marx"],
  ["Hold On to the Nights", "Richard Marx"],
  ["Heaven Is a Place on Earth", "Belinda Carlisle"],
  ["Circle in the Sand", "Belinda Carlisle"],
  ["I Think We're Alone Now", "Tiffany"],
  ["Could've Been", "Tiffany"],
  ["Lost in Your Eyes", "Debbie Gibson"],
  ["Only in My Dreams", "Debbie Gibson"],
  ["Shake Your Love", "Debbie Gibson"],
  ["You Got It (The Right Stuff)", "New Kids on the Block"],
  ["Hangin' Tough", "New Kids on the Block"],
  ["I'll Be Loving You Forever", "New Kids on the Block"],
  ["The Look", "Roxette"],
  ["It Must Have Been Love", "Roxette"],
  ["Listen to Your Heart", "Roxette"],
  ["Dangerous", "Roxette"],
  ["All Around the World", "Lisa Stansfield"],
  ["Back to Life", "Soul II Soul"],
  ["Keep On Movin'", "Soul II Soul"],
  ["Pump Up the Jam", "Technotronic"],
  ["Get Busy", "Mr. Lee"],
  ["It Takes Two", "Rob Base"],
  ["Oh Sheila", "Ready for the World"],
  ["Tarzan Boy", "Baltimora"],
  ["Self Control", "Laura Branigan"],
  ["I Can't Wait", "Nu Shooz"],
  ["Let the Music Play", "Shannon"],
  ["Give Me Tonight", "Shannon"],
  ["Holiday Rap", "MC Miker G"],
].map(([t, a]) => trackKey(t, a));

const MUST_KEEP_SET = new Set(MUST_KEEP);

/** Soft genre priority when trimming to 600 (higher = keep more). */
const GENRE_PRIORITY = {
  Pop: 100,
  Rock: 95,
  "R&B": 90,
  "Electronic / Dance": 85,
  Disco: 80,
  "Soul / Funk": 75,
  "Hip-Hop / Rap": 70,
  Reggae: 65,
  Metal: 55,
  "Indie / Alternative": 50,
  "Latin Music": 45,
  Country: 40,
  Jazz: 30,
  Folk: 25,
  "Folk / Acoustic": 25,
  Blues: 20,
  Classical: 15,
  "Gospel / Christian": 15,
  "New Age / Ambient": 10,
  "Afrobeat / Amapiano": 5,
  "K-Pop": 0,
};

/** Genres emptied entirely (not A-list 80s international radio). */
const DROP_GENRES = new Set(["K-Pop"]);

/** Soft per-genre caps before global trim. */
const GENRE_CAPS = {
  Pop: 120,
  Rock: 110,
  "R&B": 80,
  "Electronic / Dance": 70,
  Disco: 40,
  "Soul / Funk": 35,
  "Hip-Hop / Rap": 50,
  Reggae: 35,
  Metal: 30,
  "Indie / Alternative": 25,
  "Latin Music": 20,
  Country: 15,
  Jazz: 10,
  "Folk / Acoustic": 10,
  Blues: 8,
  Classical: 8,
  "Gospel / Christian": 8,
  "New Age / Ambient": 8,
  "Afrobeat / Amapiano": 8,
  "K-Pop": 0,
};

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

function isTier1(artist) {
  const a = artistKey(artist);
  if (TIER1_SET.has(a)) return true;
  for (const t of TIER1_SET) {
    if (a.includes(t) || t.includes(a)) return true;
  }
  return false;
}

function isMustKeep(title, artist) {
  const k = trackKey(title, artist);
  if (MUST_KEEP_SET.has(k)) return true;
  // loose title match against must-keep titles for same artist family
  const nt = norm(title);
  const na = artistKey(artist);
  for (const mk of MUST_KEEP_SET) {
    const [mt, ma] = mk.split("|");
    if (nt === mt && (na.includes(ma) || ma.includes(na))) return true;
  }
  return false;
}

function scoreRow(row, genre) {
  const [title, artist, year] = row;
  let score = GENRE_PRIORITY[genre] ?? 0;
  if (isMustKeep(title, artist)) score += 10_000;
  if (isTier1(artist)) score += 500;
  // Prefer true 80s, but keep late 70s gold
  if (year >= 1980 && year <= 1989) score += 50;
  else if (year >= 1977 && year <= 1979) score += 40;
  else score -= 200;
  // Prefer earlier chart peak years slightly for "golden" feel mid-decade
  if (year >= 1982 && year <= 1987) score += 10;
  return score;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeSeed(file, rows) {
  fs.writeFileSync(file, JSON.stringify(rows) + "\n");
}

/** @type {Array<{ genre: string, row: Row, score: number, key: string }>} */
const candidates = [];
const seen = new Set();

for (const [genre, file] of Object.entries(SEED_FILES)) {
  if (DROP_GENRES.has(genre)) continue;
  const rows = readJson(file);
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const [title, artist, year, youtubeId] = row;
    if (typeof title !== "string" || typeof artist !== "string") continue;
    if (typeof year !== "number") continue;
    if (year < YEAR_MIN || year > YEAR_MAX) {
      // Still allow must-keeps slightly outside window (e.g. 1976 ABBA)
      if (!(isMustKeep(title, artist) && year >= 1975 && year <= 1990)) {
        continue;
      }
    }
    if (typeof youtubeId !== "string" || youtubeId.length < 6) continue;
    const k = trackKey(title, artist);
    if (seen.has(k)) continue;
    seen.add(k);
    candidates.push({
      genre,
      row: [title, artist, year, youtubeId],
      score: scoreRow(row, genre),
      key: k,
    });
  }
}

candidates.sort((a, b) => b.score - a.score);

/** @type {Map<string, number>} */
const artistCounts = new Map();
/** @type {Map<string, number>} */
const genreCounts = new Map();
/** @type {typeof candidates} */
const selected = [];

function canTake(item, relaxArtistCap) {
  const [, artist] = item.row;
  const ak = artistKey(artist);
  const ac = artistCounts.get(ak) ?? 0;
  const gc = genreCounts.get(item.genre) ?? 0;
  const gCap = GENRE_CAPS[item.genre] ?? 20;
  if (gc >= gCap && !isMustKeep(item.row[0], item.row[1])) return false;
  if (!relaxArtistCap && ac >= MAX_PER_ARTIST && !isMustKeep(item.row[0], item.row[1])) {
    return false;
  }
  return true;
}

function take(item) {
  const [, artist] = item.row;
  const ak = artistKey(artist);
  artistCounts.set(ak, (artistCounts.get(ak) ?? 0) + 1);
  genreCounts.set(item.genre, (genreCounts.get(item.genre) ?? 0) + 1);
  selected.push(item);
}

// Pass 1: must-keeps first
for (const item of candidates) {
  if (!isMustKeep(item.row[0], item.row[1])) continue;
  if (selected.length >= MAX_TRACKS) break;
  if (selected.some((s) => s.key === item.key)) continue;
  take(item);
}

// Pass 2: tier-1 within caps
for (const item of candidates) {
  if (selected.length >= MAX_TRACKS) break;
  if (selected.some((s) => s.key === item.key)) continue;
  if (!isTier1(item.row[1])) continue;
  if (!canTake(item, false)) continue;
  take(item);
}

// Pass 3: fill remaining with highest scores
for (const item of candidates) {
  if (selected.length >= MAX_TRACKS) break;
  if (selected.some((s) => s.key === item.key)) continue;
  if (!canTake(item, false)) continue;
  take(item);
}

// Pass 4: if under target, relax artist caps slightly
if (selected.length < Math.min(MAX_TRACKS, 500)) {
  for (const item of candidates) {
    if (selected.length >= MAX_TRACKS) break;
    if (selected.some((s) => s.key === item.key)) continue;
    if (!canTake(item, true)) continue;
    take(item);
  }
}

/** @type {Record<string, Row[]>} */
const byGenre = {};
for (const genre of Object.keys(SEED_FILES)) {
  byGenre[genre] = [];
}
for (const item of selected) {
  byGenre[item.genre].push(item.row);
}

// Stable sort within genre by year then title
for (const genre of Object.keys(byGenre)) {
  byGenre[genre].sort((a, b) => a[2] - b[2] || a[0].localeCompare(b[0]));
  writeSeed(SEED_FILES[genre], byGenre[genre]);
  console.log(
    `${String(byGenre[genre].length).padStart(3)}  ${genre}`,
  );
}

const total = selected.length;
console.log(`\nCurated ${total} tracks (max ${MAX_TRACKS}).`);
if (total > MAX_TRACKS) {
  console.error("ERROR: exceeded max");
  process.exit(1);
}
if (total < 200) {
  console.error("ERROR: catalog unexpectedly small");
  process.exit(1);
}

const missingMust = [];
for (const mk of MUST_KEEP_SET) {
  if (!selected.some((s) => s.key === mk || isMustKeep(s.row[0], s.row[1]) && trackKey(s.row[0], s.row[1]) === mk)) {
    // check loose
    const [mt, ma] = mk.split("|");
    const found = selected.some((s) => {
      return norm(s.row[0]) === mt && artistKey(s.row[1]).includes(ma);
    });
    if (!found) missingMust.push(mk);
  }
}
// Only report must-keeps that existed in seeds but weren't selected
const seedKeys = new Set(candidates.map((c) => c.key));
const missingPresent = missingMust.filter((mk) => {
  const [mt, ma] = mk.split("|");
  return candidates.some(
    (c) => norm(c.row[0]) === mt && artistKey(c.row[1]).includes(ma),
  );
});
if (missingPresent.length) {
  console.log(`\nWarning: ${missingPresent.length} must-keeps in seeds were dropped:`);
  for (const m of missingPresent.slice(0, 20)) console.log("  -", m);
}

const absent = [...MUST_KEEP_SET].filter((mk) => {
  const [mt, ma] = mk.split("|");
  return !candidates.some(
    (c) => norm(c.row[0]) === mt && artistKey(c.row[1]).includes(ma),
  );
});
console.log(
  `\nMust-keep titles not in seeds (cannot add without YouTube IDs): ${absent.length}`,
);
