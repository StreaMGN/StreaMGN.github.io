window.STREAMGN_CONFIG = {
  tmdbKey: 'e64c3c6523ce13cfa49170fac2bb1691',
  apiBase: 'https://api.themoviedb.org/3',
  images: {
    poster: 'https://image.tmdb.org/t/p/w342',
    posterWide: 'https://image.tmdb.org/t/p/w780',
    backdrop: 'https://image.tmdb.org/t/p/w1280',
    original: 'https://image.tmdb.org/t/p/original',
    face: 'https://image.tmdb.org/t/p/w185',
    still: 'https://image.tmdb.org/t/p/w300'
  },
  sportDefaultUrl: 'https://pepperstream.xyz/index.php',
  animeUnityUrl: 'https://www.animeunity.so',
  remoteConfigUrl: 'assets/remote-config.json',
  externalSitesUrl: 'assets/external-sites.json',
  sportAdminEditUrl: 'https://github.com/StreaMGN/StreaMGN.github.io/edit/main/assets/remote-config.json',
  externalSitesAdminEditUrl: 'https://github.com/StreaMGN/StreaMGN.github.io/edit/main/assets/external-sites.json',
  streamApiBase: '',
  streamRoutes: {
    movie: '/play/movie/:id',
    tv: '/play/tv/:id/:season/:episode',
    anime: '/play/anime/:id',
    sport: '/sport/live'
  },
  streamProviders: {
    movie: ['vixsrc'],
    tv: ['vixsrc'],
    anime: ['streamrip'],
    sport: ['configured']
  },
  streamUiSources: {
    normal: ['vixsrc', 'vidsrc', 'embed'],
    anime: ['streamrip']
  },
  streamripBaseUrl: 'https://streamrip-website-production.up.railway.app',
  aniListApiBase: 'https://graphql.anilist.co',
  tmdbCacheMaxAge: 6 * 60 * 60 * 1000,
  tmdbCacheMaxItems: 260,
  notificationInterval: 6 * 60 * 60 * 1000,
  notificationDailyLimit: 3,
  notificationQuietWindow: 8 * 60 * 60 * 1000,
  pushPublicKey: '',
  pushSubscribeUrl: '',
  pushUnsubscribeUrl: ''
};
