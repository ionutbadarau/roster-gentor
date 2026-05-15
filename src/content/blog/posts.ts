export type BlogBlock =
  | { type: 'h2'; text: string; id: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'quote'; text: string };

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  author: string;
  readingMinutes: number;
  tags: string[];
  body: BlogBlock[];
};

export const blogPosts: BlogPost[] = [
  {
    slug: 'cum-faci-planificare-garzi',
    title: 'Cum faci planificarea gărzilor pentru o echipă cu program de tură — ghid complet 2026',
    description:
      'Ghid practic pentru coordonatori de echipă — medici-șefi, comandanți de stație, șefi de tură din dispecerat, paramedici, securitate: cum construiești programul lunar de gărzi pas cu pas, ce reguli legale trebuie să respecți și cum eviți erorile clasice.',
    publishedAt: '2026-05-05',
    updatedAt: '2026-05-05',
    author: 'Echipa PlanGarzi',
    readingMinutes: 9,
    tags: ['planificare gărzi', 'ture rotative', 'ghid'],
    body: [
      {
        type: 'p',
        text: 'Planificarea gărzilor pentru o echipă cu program rotativ — fie că vorbim de o secție de spital, o stație de pompieri, un echipaj SMURD, o tură de asistenți medicali, o agenție de securitate sau un dispecerat 24/7 — este una dintre cele mai consumatoare sarcini administrative ale unui coordonator de echipă. Indiferent de specialitate, trebuie să acoperi fiecare zi cu numărul corect de persoane, să respecți perioadele de odihnă în funcție de tipul turei, să iei în calcul concediile aprobate și, în plus, să distribui echitabil turele grele de noapte și de weekend. Făcută manual, planificarea unei echipe cu 15–25 de membri poate dura între 4 și 12 ore pe lună. Acest ghid trece prin pașii corecți, prin tipurile uzuale de ture și prin greșelile pe care un coordonator le poate evita încă din prima lună — exemplele se referă în special la secțiile medicale, însă principiile se aplică identic oricărei organizații cu ture rotative.',
      },
      {
        type: 'h2',
        id: 'what-is-good-planning',
        text: 'Ce înseamnă o planificare bună a gărzilor',
      },
      {
        type: 'p',
        text: 'O planificare bună nu înseamnă doar acoperirea fiecărei zile cu numărul corect de medici. Înseamnă echilibru: niciun medic nu acumulează ture suplimentare în detrimentul altora, perioadele de odihnă sunt respectate, iar concediile și preferințele individuale sunt luate în calcul. La nivel de secție, coordonatorul (de obicei medicul-șef sau adjunctul acestuia) răspunde de acest echilibru lună de lună. Un program bun reduce oboseala, previne erorile cauzate de epuizare și menține moralul echipei. Un program prost se traduce în reclamații repetate, cereri de schimb de ultim moment și frustrări în echipă.',
      },
      {
        type: 'p',
        text: 'Mai exact, un program lunar bine făcut îndeplinește simultan mai multe condiții — nu doar una sau două:',
      },
      {
        type: 'ul',
        items: [
          'Acoperă fiecare zi cu numărul minim de medici de gardă cerut de specialitate.',
          'Respectă perioadele de odihnă în funcție de tipul turei lucrate.',
          'Distribuie turele de noapte și de weekend echilibrat între medicii cu normă comparabilă.',
          'Ia în calcul concediile aprobate și zilele de incapacitate temporară.',
          'Comunică transparent orele lucrate față de norma lunară (delta +/-).',
        ],
      },
      {
        type: 'h2',
        id: 'monthly-planning-steps',
        text: 'Pașii planificării lunare: de la echipe la program final',
      },
      {
        type: 'p',
        text: 'Procesul tipic urmărește patru etape. Întâi vine definirea echipelor rotative — câți medici, ce specialitate, ce ordine de rotație. La majoritatea secțiilor există între 2 și 4 echipe care își alternează zilele de gardă, plus, eventual, câțiva doctori flotanți care umplu golurile rămase. A doua etapă: colectarea concediilor și a preferințelor pentru luna următoare. Aici contează să ai un termen-limită clar — orice cerere primită după acest termen riscă să rămână neîndeplinită, iar lipsa termenului duce la modificări nesfârșite în ultimul moment.',
      },
      {
        type: 'p',
        text: 'A treia etapă este construcția propriu-zisă a programului. Pentru o secție cu 15–25 de medici și 30 de zile, un coordonator experimentat alocă în medie 4–8 ore pentru a obține un draft acceptabil. Etapa finală constă în validarea cu echipa, ajustările manuale și publicarea programului. Vezi mai multe despre [funcționalitățile PlanGarzi](/features) care automatizează aproape complet aceste etape.',
      },
      {
        type: 'h2',
        id: 'rest-rules',
        text: 'Tipuri de ture și perioade de odihnă',
      },
      {
        type: 'p',
        text: 'De obicei turele pot fi 12/24 sau 24/48, iar perioadele de odihnă trebuie respectate în funcție de tipul de ture lucrate. Cu cât tura este mai lungă sau mai solicitantă (de exemplu o tură de noapte), cu atât perioada de odihnă care urmează trebuie să fie mai mare. Un coordonator bun stabilește din start ce tip de ture rulează secția și aplică perioadele de odihnă consistent pentru toți medicii.',
      },
      {
        type: 'p',
        text: 'În practică, multe planificări scapă din neatenție pauze prea scurte — în special atunci când un medic prinde două gărzi de noapte în aceeași săptămână sau când un schimb de ultim moment scurtează intervalul de recuperare. Un instrument care detectează automat aceste situații elimină munca de a ține socoteala manual pentru fiecare medic în parte.',
      },
      {
        type: 'quote',
        text: 'Situația cea mai des întâlnită din neatenție: două ture de noapte prea aproape una de alta, fără timp suficient de recuperare.',
      },
      {
        type: 'h2',
        id: 'leave-bridge-days',
        text: 'Concedii, zile punte și echilibrarea normei',
      },
      {
        type: 'p',
        text: 'Concediile de odihnă sunt parte din planificare și trebuie integrate din start. La nivel de secție, programul trebuie să țină cont de zilele de concediu deja aprobate și să excludă acei medici de la rotație. Norma lunară (numărul minim de ore lucrate) se ajustează proporțional cu zilele de concediu — un medic care lipsește 5 zile dintr-o lună de 22 de zile lucrătoare are norma redusă la aproximativ 7 ore × 17 zile.',
      },
      {
        type: 'p',
        text: 'Zilele punte — weekend-uri sau sărbători prinse între concedii — pot fi tratate ca odihnă suplimentară sau ca zile lucrătoare, în funcție de politica secției. Important este să decizi consistent, nu de la caz la caz, altfel apar discuții legate de favoritism. Un program bun marchează clar zilele punte și le aplică egal pentru toți medicii care intră sub incidența lor.',
      },
      {
        type: 'h2',
        id: 'common-errors',
        text: 'Erori frecvente la planificarea manuală',
      },
      {
        type: 'p',
        text: 'Cele mai des întâlnite probleme la planificarea făcută în Excel sau pe foaie sunt:',
      },
      {
        type: 'ul',
        items: [
          'Distribuirea inegală a turelor de noapte (un medic ajunge la 8 nopți pe lună, altul la 4).',
          'Pauze prea scurte după o tură de noapte din cauza unui schimb de ultim moment.',
          'Ignorarea zilelor de concediu deja aprobate — medicul descoperă cu o săptămână înainte că trebuie să lucreze.',
          'Suprasolicitarea săptămânală în săptămânile cu sărbători.',
          'Modificări de ultim moment care nu ajung la toți medicii, urmate de telefoane de tip „eu când lucrez?".',
        ],
      },
      {
        type: 'p',
        text: 'Un instrument automat previne marea majoritate a acestor erori, verificând fiecare tură față de perioadele de odihnă stabilite și echilibrând automat distribuirea turelor de noapte și weekend între medicii cu normă comparabilă.',
      },
      {
        type: 'h2',
        id: 'how-plangarzi-helps',
        text: 'Cum te ajută PlanGarzi să generezi programul automat',
      },
      {
        type: 'p',
        text: '[PlanGarzi](/) a fost construit pentru coordonatori de echipă care lucrează cu ture rotative — fie că este vorba de o secție medicală, o stație de pompieri, un echipaj de paramedici, o tură de asistenți medicali, o agenție de securitate sau un dispecerat 24/7. Configurezi echipele, regulile de odihnă și disponibilitatea fiecărui membru, iar algoritmul care prioritizează cadența generează programul lunar în câteva secunde. Conflictele de odihnă sunt detectate automat și marcate vizual pe celulele afectate. Egalizarea turelor distribuie corect turele de noapte și de zi între membrii cu normă echivalentă. Concediile și zilele punte sunt gestionate într-un calendar simplu, cu validare a numărului de zile rămase.',
      },
      {
        type: 'p',
        text: 'La final exporți programul în PDF (pentru avizier) sau Excel (pentru raportare la HR), sau îl trimiți pe email cu link personal pentru fiecare membru al echipei. Linkul nu cere autentificare: destinatarul îl deschide și vede direct turele lui din luna respectivă. Vezi [prețurile transparente](/pricing) — 90 de zile probă gratuită, fără card de credit.',
      },
    ],
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

export function getAllPostsSorted(): BlogPost[] {
  return [...blogPosts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
