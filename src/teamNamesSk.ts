/**
 * Názvy tímov po slovensky – jedno miesto pre server, Telegram aj webové stránky (cez /team-names-sk.js).
 */

/**
 * Kluby po slovensky (10. 11. 2026, Michal: „kompletne gramatiku po slovensky, hlavne názvy tímov“).
 * Kľúč = názov z API-Football. Mestá a kluby tak, ako ich píšu slovenské športové médiá
 * (Bayern Mníchov, Inter Miláno, AS Rím, Paríž Saint-Germain…). Čo tu nie je, ostáva v pôvodnom tvare.
 */
const CLUB_NAME_SK: Record<string, string> = {
  // Nemecko
  "Bayern München": "Bayern Mníchov", "Bayern Munich": "Bayern Mníchov", "FC Bayern München": "Bayern Mníchov",
  "1. FC Köln": "1. FC Kolín", "FC Koln": "1. FC Kolín", "1. FC Nürnberg": "1. FC Norimberg", "1.FC Nürnberg": "1. FC Norimberg",
  "Borussia Mönchengladbach": "Borussia Mönchengladbach", "1899 Hoffenheim": "Hoffenheim", "FSV Mainz 05": "FSV Mainz",
  "Hertha Berlin": "Hertha Berlín", "Hertha BSC": "Hertha Berlín", "Union Berlin": "Union Berlín", "1. FC Union Berlin": "Union Berlín",
  "FC Schalke 04": "Schalke 04", "Fortuna Düsseldorf": "Fortuna Düsseldorf", "Hannover 96": "Hannover 96",
  "1. FC Kaiserslautern": "1. FC Kaiserslautern", "SC Paderborn 07": "SC Paderborn", "Karlsruher SC": "Karlsruher SC",
  "1. FC Magdeburg": "1. FC Magdeburg", "Eintracht Braunschweig": "Eintracht Braunschweig",
  // Taliansko
  "Inter": "Inter Miláno", "Inter Milan": "Inter Miláno", "AC Milan": "AC Miláno", "Napoli": "SSC Neapol", "SSC Napoli": "SSC Neapol",
  "AS Roma": "AS Rím", "Roma": "AS Rím", "Lazio": "Lazio Rím", "Juventus": "Juventus Turín", "Torino": "FC Turín",
  "Genoa": "FC Janov", "Sampdoria": "Sampdoria Janov", "Atalanta": "Atalanta Bergamo", "Verona": "Hellas Verona",
  "Hellas Verona": "Hellas Verona", "Venezia": "FC Benátky", "Fiorentina": "Fiorentina", "Bologna": "FC Bologna",
  "Udinese": "Udinese", "Cagliari": "Cagliari", "Parma": "Parma", "Lecce": "Lecce", "Pisa": "Pisa",
  // Španielsko
  "Barcelona": "FC Barcelona", "Atletico Madrid": "Atlético Madrid", "Sevilla": "FC Sevilla", "Real Betis": "Betis Sevilla",
  "Valencia": "Valencia CF", "Athletic Club": "Athletic Bilbao", "Alaves": "Deportivo Alavés", "Mallorca": "RCD Mallorca",
  "Espanyol": "Espanyol Barcelona", "Celta Vigo": "Celta Vigo", "Oviedo": "Real Oviedo", "Real Oviedo": "Real Oviedo",
  "Deportivo La Coruna": "Deportivo La Coruña", "Sporting Gijon": "Sporting Gijón", "Malaga": "Málaga", "Cadiz": "Cádiz",
  "Almeria": "Almería", "Leganes": "Leganés", "Cordoba": "Córdoba", "Castellon": "Castellón", "Mirandes": "Mirandés",
  "Leganés": "Leganés", "Las Palmas": "Las Palmas", "Real Valladolid": "Real Valladolid", "Valladolid": "Real Valladolid",
  "Racing Santander": "Racing Santander", "Huesca": "SD Huesca", "Zaragoza": "Real Zaragoza", "Real Zaragoza": "Real Zaragoza",
  "Granada CF": "Granada", "Burgos": "Burgos CF", "Albacete": "Albacete", "Eibar": "SD Eibar",
  // Francúzsko
  "Paris Saint Germain": "Paríž Saint-Germain", "Paris Saint-Germain": "Paríž Saint-Germain", "Paris FC": "Paríž FC",
  "Marseille": "Olympique Marseille", "Lyon": "Olympique Lyon", "Monaco": "AS Monaco", "Lille": "LOSC Lille",
  "Nice": "OGC Nice", "Rennes": "Stade Rennes", "Stade Rennais": "Stade Rennes", "Lens": "RC Lens", "Nantes": "FC Nantes",
  "Strasbourg": "RC Štrasburg", "Stade Brestois 29": "Stade Brest", "Brest": "Stade Brest", "Toulouse": "FC Toulouse",
  "Auxerre": "AJ Auxerre", "Angers": "Angers SCO", "Lorient": "FC Lorient", "Metz": "FC Metz",
  "Saint Etienne": "Saint-Étienne", "Montpellier": "Montpellier HSC", "Reims": "Stade Reims", "Bordeaux": "Girondins Bordeaux",
  "Guingamp": "EA Guingamp", "Caen": "SM Caen", "Bastia": "SC Bastia", "Amiens": "Amiens SC", "Grenoble": "Grenoble Foot",
  "Nancy": "AS Nancy", "Troyes": "ESTAC Troyes", "Clermont Foot": "Clermont Foot", "Pau": "Pau FC", "Dunkerque": "USL Dunkerque",
  // Anglicko
  "Wolves": "Wolverhampton", "Wolverhampton Wanderers": "Wolverhampton", "Nottingham Forest": "Nottingham Forest",
  "Sheffield Utd": "Sheffield United", "Sheffield Wednesday": "Sheffield Wednesday", "West Brom": "West Bromwich",
  "QPR": "Queens Park Rangers",
  // Holandsko
  "Ajax": "Ajax Amsterdam", "Feyenoord": "Feyenoord Rotterdam", "Twente": "FC Twente", "FC Twente": "FC Twente",
  "Utrecht": "FC Utrecht", "FC Utrecht": "FC Utrecht", "Groningen": "FC Groningen", "FC Groningen": "FC Groningen",
  "Sparta Rotterdam": "Sparta Rotterdam", "Excelsior": "Excelsior Rotterdam", "GO Ahead Eagles": "Go Ahead Eagles",
  "Fortuna Sittard": "Fortuna Sittard", "Heracles": "Heracles Almelo", "NEC Nijmegen": "NEC Nijmegen", "PEC Zwolle": "PEC Zwolle",
  // Portugalsko
  "Benfica": "Benfica Lisabon", "Sporting CP": "Sporting Lisabon", "Sporting Lisbon": "Sporting Lisabon",
  "SC Braga": "SC Braga", "Guimaraes": "Vitória Guimarães", "Vitoria Guimaraes": "Vitória Guimarães", "Estoril": "Estoril Praia",
  "Famalicao": "Famalicão", "Rio Ave": "Rio Ave", "Gil Vicente": "Gil Vicente", "Arouca": "FC Arouca", "Casa Pia": "Casa Pia",
  // Belgicko
  "Club Brugge KV": "Club Bruggy", "Club Brugge": "Club Bruggy", "Anderlecht": "Anderlecht Brusel",
  "Union St. Gilloise": "Union Saint-Gilloise", "Union Saint-Gilloise": "Union Saint-Gilloise", "Standard Liege": "Standard Lutych",
  "Genk": "KRC Genk", "Gent": "KAA Gent", "Antwerp": "Royal Antverpy", "Royal Antwerp": "Royal Antverpy",
  "Cercle Brugge": "Cercle Bruggy", "Mechelen": "KV Mechelen", "Charleroi": "Sporting Charleroi", "Westerlo": "KVC Westerlo",
  "OH Leuven": "OH Leuven", "St. Truiden": "Sint-Truiden", "Dender": "FCV Dender",
  // Turecko
  "Galatasaray": "Galatasaray Istanbul", "Fenerbahce": "Fenerbahçe Istanbul", "Fenerbahçe": "Fenerbahçe Istanbul",
  "Besiktas": "Beşiktaş Istanbul", "Beşiktaş": "Beşiktaş Istanbul", "Basaksehir": "Başakşehir Istanbul",
  "Istanbul Basaksehir": "Başakşehir Istanbul", "Kasimpasa": "Kasımpaşa Istanbul", "Karagumruk": "Fatih Karagümrük",
  "Fatih Karagümrük": "Fatih Karagümrük", "Goztepe": "Göztepe Izmir", "Göztepe": "Göztepe Izmir", "Kocaelispor": "Kocaelispor",
  "Gaziantep FK": "Gaziantep", "Kayserispor": "Kayserispor", "Konyaspor": "Konyaspor", "Alanyaspor": "Alanyaspor",
  "Antalyaspor": "Antalyaspor", "Samsunspor": "Samsunspor", "Eyupspor": "Eyüpspor", "Rizespor": "Çaykur Rizespor",
  "Genclerbirligi": "Gençlerbirliği", "Trabzonspor": "Trabzonspor",
  // Dánsko
  "FC Copenhagen": "FC Kodaň", "Copenhagen": "FC Kodaň", "Brondby": "Bröndby IF", "Brøndby": "Bröndby IF",
  "Aarhus": "AGF Aarhus", "AGF Aarhus": "AGF Aarhus", "FC Nordsjaelland": "FC Nordsjælland", "Nordsjaelland": "FC Nordsjælland",
  "Aalborg": "AaB Aalborg", "Randers FC": "Randers", "Silkeborg": "Silkeborg IF", "Odense": "OB Odense", "Viborg": "Viborg FF",
  "Sonderjyske": "Sønderjyske", "Vejle": "Vejle BK", "Fredericia": "FC Fredericia",
  // Škótsko
  "Celtic": "Celtic Glasgow", "Rangers": "Rangers Glasgow", "Hearts": "Heart of Midlothian", "Hibernian": "Hibernian Edinburgh",
  "Aberdeen": "Aberdeen", "Dundee": "Dundee FC", "Dundee Utd": "Dundee United", "Motherwell": "Motherwell",
  "ST Mirren": "St. Mirren", "Kilmarnock": "Kilmarnock", "Livingston": "Livingston", "Falkirk": "Falkirk",
  // Liga majstrov a ďalšie
  "Olympiakos Piraeus": "Olympiakos Pireus", "Olympiacos Piraeus": "Olympiakos Pireus", "Panathinaikos": "Panathinaikos Atény",
  "AEK Athens FC": "AEK Atény", "AEK Athens": "AEK Atény", "PAOK": "PAOK Solún",
  "Kairat Almaty": "Kajrat Almaty", "Qarabag": "Karabach Agdam", "Bodo/Glimt": "Bodø/Glimt", "Pafos": "Pafos FC",
  "Shakhtar Donetsk": "Šachtar Doneck", "Dynamo Kyiv": "Dynamo Kyjev", "Dinamo Zagreb": "Dinamo Záhreb",
  "Crvena Zvezda": "Crvena zvezda Belehrad", "FK Crvena Zvezda": "Crvena zvezda Belehrad", "Partizan": "Partizan Belehrad",
  "Red Bull Salzburg": "RB Salzburg", "BSC Young Boys": "Young Boys Bern", "Young Boys": "Young Boys Bern",
  "FC Basel 1893": "FC Bazilej", "FC Basel": "FC Bazilej", "FC Zurich": "FC Zürich", "Ferencvarosi TC": "Ferencváros Budapešť",
  "Ferencvaros": "Ferencváros Budapešť", "Legia Warszawa": "Legia Varšava", "Lech Poznan": "Lech Poznaň",
  "Rakow Czestochowa": "Raków Čenstochová", "Plzen": "Viktoria Plzeň", "Viktoria Plzen": "Viktoria Plzeň",
  "Slavia Praha": "Slavia Praha", "Sparta Praha": "Sparta Praha", "Slovan Bratislava": "Slovan Bratislava",
  "Ludogorets": "Ludogorec Razgrad", "Malmo FF": "Malmö FF", "Malmö FF": "Malmö FF", "FC Midtjylland": "FC Midtjylland",
  "Sturm Graz": "Sturm Graz", "Rapid Vienna": "Rapid Viedeň", "SK Rapid Wien": "Rapid Viedeň", "Austria Vienna": "Austria Viedeň",
  "Maccabi Tel Aviv": "Maccabi Tel Aviv", "Maccabi Haifa": "Maccabi Haifa", "Molde": "Molde FK", "Rosenborg": "Rosenborg Trondheim",
  "BK Hacken": "BK Häcken", "Hacken": "BK Häcken", "Valerenga": "Vålerenga", "St. Polten": "St. Pölten", "SKN St. Polten": "St. Pölten",
  "Brann": "SK Brann", "Vorskla Poltava": "Vorskla Poltava",
};

// ---- Reprezentácie po slovensky ----
export const COUNTRY_NAME_SK: Record<string, string> = {
  Albania: "Albánsko",
  Andorra: "Andorra",
  Armenia: "Arménsko",
  Austria: "Rakúsko",
  Azerbaijan: "Azerbajdžan",
  Belarus: "Bielorusko",
  Belgium: "Belgicko",
  "Bosnia and Herzegovina": "Bosna a Hercegovina",
  Bulgaria: "Bulharsko",
  Croatia: "Chorvátsko",
  Cyprus: "Cyprus",
  "Czech Republic": "Česko",
  Denmark: "Dánsko",
  England: "Anglicko",
  Estonia: "Estónsko",
  "Faroe Islands": "Faerské ostrovy",
  Finland: "Fínsko",
  France: "Francúzsko",
  Georgia: "Gruzínsko",
  Germany: "Nemecko",
  Gibraltar: "Gibraltár",
  Greece: "Grécko",
  Hungary: "Maďarsko",
  Iceland: "Island",
  Israel: "Izrael",
  Italy: "Taliansko",
  Kazakhstan: "Kazachstan",
  Kosovo: "Kosovo",
  Latvia: "Lotyšsko",
  Liechtenstein: "Lichtenštajnsko",
  Lithuania: "Litva",
  Luxembourg: "Luxembursko",
  Malta: "Malta",
  Moldova: "Moldavsko",
  Montenegro: "Čierna Hora",
  Netherlands: "Holandsko",
  "North Macedonia": "Severné Macedónsko",
  "Northern Ireland": "Severné Írsko",
  Norway: "Nórsko",
  Poland: "Poľsko",
  Portugal: "Portugalsko",
  Romania: "Rumunsko",
  Russia: "Rusko",
  "San Marino": "San Maríno",
  Scotland: "Škótsko",
  Serbia: "Srbsko",
  Slovakia: "Slovensko",
  Slovenia: "Slovinsko",
  Spain: "Španielsko",
  Sweden: "Švédsko",
  Switzerland: "Švajčiarsko",
  Turkey: "Turecko",
  Ukraine: "Ukrajina",
  Wales: "Wales",
  // Alternatívne názvy z API a reprezentácie mimo Európy
  Czechia: "Česko",
  "Rep. Of Ireland": "Írsko",
  "Republic of Ireland": "Írsko",
  "FYR Macedonia": "Severné Macedónsko",
  Macedonia: "Severné Macedónsko",
  "Türkiye": "Turecko",
  Turkiye: "Turecko",
  "Bosnia & Herzegovina": "Bosna a Hercegovina",
  Ireland: "Írsko",
  Holland: "Holandsko",
  Kyrgyzstan: "Kirgizsko",
  Argentina: "Argentína",
  Brazil: "Brazília",
  Uruguay: "Uruguaj",
  Colombia: "Kolumbia",
  Chile: "Čile",
  Paraguay: "Paraguaj",
  Peru: "Peru",
  Ecuador: "Ekvádor",
  Bolivia: "Bolívia",
  Venezuela: "Venezuela",
  USA: "USA",
  "United States": "USA",
  Mexico: "Mexiko",
  Canada: "Kanada",
  "Costa Rica": "Kostarika",
  Panama: "Panama",
  Jamaica: "Jamajka",
  Honduras: "Honduras",
  Haiti: "Haiti",
  Curacao: "Curaçao",
  Morocco: "Maroko",
  Algeria: "Alžírsko",
  Tunisia: "Tunisko",
  Egypt: "Egypt",
  Senegal: "Senegal",
  Nigeria: "Nigéria",
  Ghana: "Ghana",
  Cameroon: "Kamerun",
  "Ivory Coast": "Pobrežie Slonoviny",
  "Cote D'Ivoire": "Pobrežie Slonoviny",
  "South Africa": "Južná Afrika",
  Mali: "Mali",
  "Cape Verde Islands": "Kapverdy",
  Japan: "Japonsko",
  "South Korea": "Južná Kórea",
  "Korea Republic": "Južná Kórea",
  Australia: "Austrália",
  Iran: "Irán",
  "Saudi Arabia": "Saudská Arábia",
  Qatar: "Katar",
  Iraq: "Irak",
  Jordan: "Jordánsko",
  "United Arab Emirates": "Spojené arabské emiráty",
  Uzbekistan: "Uzbekistan",
  China: "Čína",
  "China PR": "Čína",
  "New Zealand": "Nový Zéland",
};

export { CLUB_NAME_SK };

/** Ženské tímy: API ich píše s príponou „ W“ / „ Women“ → „FC Barcelona (ženy)“. */
const WOMEN_SUFFIX = /\s+(?:W|Women|Ladies|Fem\.?|Femenino|Feminine|Féminine|\(W\))$/;

export function translateTeamName(name: string): string {
  if (!name) return name;
  const direct = COUNTRY_NAME_SK[name] ?? CLUB_NAME_SK[name];
  if (direct) return direct;
  const m = WOMEN_SUFFIX.exec(name);
  if (m) {
    const base = name.slice(0, m.index).trim();
    return (COUNTRY_NAME_SK[base] ?? CLUB_NAME_SK[base] ?? base) + " (ženy)";
  }
  return name;
}

/** Skript pre prehliadač: window.teamSk(názov) robí to isté ako translateTeamName. */
export function teamNamesBrowserScript(): string {
  return (
    "window.TEAM_NAME_SK=" + JSON.stringify({ ...CLUB_NAME_SK, ...COUNTRY_NAME_SK }) + ";\n" +
    "window.teamSk=function(n){if(!n)return n;var d=window.TEAM_NAME_SK;if(Object.prototype.hasOwnProperty.call(d,n))return d[n];" +
    "var m=/\\s+(?:W|Women|Ladies|Fem\\.?|Femenino|Feminine|Féminine|\\(W\\))$/.exec(n);" +
    "if(m){var b=n.slice(0,m.index).trim();return (Object.prototype.hasOwnProperty.call(d,b)?d[b]:b)+' (ženy)';}return n;};\n"
  );
}
