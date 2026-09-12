/**
 * Français — langue de référence.
 *
 * Vocabulaire imposé (SPEC §2) : position short, collatéral, notionnel, prix
 * d'entrée, barrière, plafond de gain, knock-out, premium quotidien, capacité,
 * prix de règlement, TWAP.
 *
 * Mots bannis, nulle part dans ce fichier : emprunter, vendre, vente à
 * découvert, liquider, marge, appel de marge, « levier » sans préciser que la
 * perte est plafonnée, garanti, sans risque.
 *
 * Les clés sont plates et en pointillés. `{var}` est interpolé.
 */

export const fr = {
  // ── chrome ────────────────────────────────────────────────────────────
  'nav.scanner': 'Tokens',
  'nav.positions': 'Positions',
  'nav.hlp': 'HLP',
  'nav.howItWorks': 'Comment ça marche',
  'nav.search': 'Nom, ticker ou adresse de contrat…',
  'nav.balance': 'Solde USDG',
  'nav.mode.paper': 'PAPER',
  'nav.mode.testnet': 'TESTNET',
  'nav.mode.mainnet': 'MAINNET',
  'nav.mode.paper.hint': 'Mode paper : aucune transaction, aucun fonds réel. Même interface que le mainnet.',
  'nav.alerts': 'Alertes barrière',
  'nav.language': 'Langue',

  'home.kicker': 'Robinhood Chain · short plafonné',
  'home.title1': 'Pariez contre',
  'home.title2': 'tout token.',
  'home.tagline':
    'Pariez à la baisse sur n’importe quel token éligible. Perte plafonnée à votre collatéral, gain plafonné à 100%.',

  // ── statuts (SPEC §6) ─────────────────────────────────────────────────
  'status.ELIGIBLE': 'Ouvrable',
  'status.WARMUP': 'Rodage',
  'status.CAPACITY_FULL': 'Capacité pleine',
  'status.TREASURY_EXHAUSTED': 'Trésor épuisé',
  'status.REDUCE_ONLY': 'Reduce-only',
  'status.INELIGIBLE_CONCENTRATION': 'Concentration',
  'status.INELIGIBLE_DEPTH': 'Pool trop fin',
  'status.ORACLE_STALE': 'Oracle en retard',
  'status.PAUSED': 'En pause',
  'status.UNTRACKED': 'Non suivi',

  'status.ELIGIBLE.reason': 'Ouvrable maintenant.',
  'status.WARMUP.reason':
    'Moins de 24 h d’historique TWAP. L’ouverture se débloque à la fin du rodage.',
  'status.CAPACITY_FULL.reason':
    'Le notionnel ouvert a atteint la capacité du token. Une ouverture redevient possible dès qu’une position se ferme.',
  'status.TREASURY_EXHAUSTED.reason':
    'Le trésor du token est épuisé. Plus aucune ouverture ; les positions existantes courent.',
  'status.REDUCE_ONLY.reason': 'Plus aucune ouverture sur ce token. Les positions existantes courent.',
  'status.INELIGIBLE_CONCENTRATION.reason':
    'Un groupe de wallets liés détient {pct} de la supply, au-dessus du seuil de {threshold}.',
  'status.INELIGIBLE_DEPTH.reason':
    'Le pool fait {depth} de profondeur côté USDG, trop peu pour être marqué de façon fiable.',
  'status.ORACLE_STALE.reason':
    'L’oracle n’a pas été mis à jour depuis {age}. Ouverture bloquée tant qu’un prix frais n’est pas disponible.',
  'status.PAUSED.reason': 'Le protocole est en pause sur ce token. Rien ne s’ouvre et rien ne se ferme.',
  'status.UNTRACKED.reason': 'Ce token n’a pas de pool suivi.',
  'status.recheckIn': 'Reprise dans {time}',

  // ── liste ─────────────────────────────────────────────────────────────
  'list.title': 'Tokens',
  'list.openableOnly': 'Ouvrables maintenant',
  'list.all': 'Tous',
  'list.sortCapacity': 'Capacité',
  'list.sortRate': 'Taux',
  'list.sortDepth': 'Profondeur',
  'list.col.token': 'Token',
  'list.col.address': 'Adresse',
  'list.col.status': 'Statut',
  'list.col.capacity': 'Capacité restante',
  'list.col.rate': 'Premium / jour',
  'list.col.depth': 'Profondeur',
  'list.col.spot': 'Spot',
  'list.col.twap': 'TWAP 24h',
  'list.open': 'Ouvrir',
  'list.empty': 'Aucun token ouvrable avec ces filtres.',
  'list.emptyHint': 'Retirez « Ouvrables maintenant » pour voir tous les tokens et leur statut.',
  'list.count': '{n} tokens',
  'list.openableCount': '{n} ouvrables',
  'list.feed.trending': 'Listés',
  'list.feed.new': 'Nouveaux lancements',
  'list.feed.live': 'EN DIRECT',
  'list.feed.paused': 'EN PAUSE',
  'list.feed.since': 'depuis votre arrivée',
  'list.feed.loading': 'Chargement…',
  'list.class.all': 'Tout',

  // ── recherche (SPEC §3) ───────────────────────────────────────────────
  'search.placeholder': 'Nom, ticker ou adresse de contrat…',
  'search.homonym': 'Homonyme',
  'search.homonymHint':
    'Plusieurs tokens portent ce nom. Vérifiez l’adresse : les imitations sont la norme sur un launchpad.',
  'search.untracked.title': 'Ce token n’a pas de pool suivi',
  'search.untracked.body':
    'L’adresse est valide, mais aucun pool n’est suivi pour elle. Impossible d’ouvrir une position tant qu’il n’est pas indexé.',
  'search.untracked.request': 'Demander l’ajout',
  'search.untracked.requested': 'Demande envoyée',
  'search.invalid.title': 'Adresse invalide',
  'search.invalid.body':
    'Une adresse fait 42 caractères : « 0x » suivi de 40 caractères hexadécimaux (0-9, a-f).',
  'search.none': 'Aucun résultat pour « {q} ».',
  'search.noneHint': 'Essayez un ticker, un nom, ou collez une adresse complète.',
  'search.loading': 'Recherche…',
  'search.onChain': 'Identité lue sur la chaîne',

  // ── adresse ───────────────────────────────────────────────────────────
  'address.copy': 'Copier l’adresse',
  'address.copied': 'Copiée',
  'address.explorer': 'Voir sur l’explorateur',

  // ── fiche token ───────────────────────────────────────────────────────
  'token.depth': 'Profondeur du pool',
  'token.spot': 'Spot',
  'token.twap24': 'TWAP 24h',
  'token.twap72': 'TWAP 72h',
  'token.utilization': 'Utilisation',
  'token.remaining': 'Capacité restante',
  'token.lastSample': 'Dernier échantillon',
  'token.concentration': 'Plus gros cluster',
  'token.concentration.mock': 'donnée simulée — le pipeline d’analyse n’existe pas encore',
  'token.chart.legendSpot': 'Spot',
  'token.chart.why':
    'Le règlement se fait sur les TWAP, pas sur le spot. Le spot est affiché pour contexte.',
  'token.notFound': 'Token introuvable',
  'token.back': 'Retour à la liste',

  // ── ticket (SPEC §4A) ─────────────────────────────────────────────────
  'ticket.title': 'Position short',
  'ticket.collateral': 'Collatéral',
  'ticket.balance': 'Solde',
  'ticket.max': 'MAX',
  'ticket.notional': 'Notionnel',
  'ticket.notionalHint': 'Dérivé du collatéral par le devis. Lecture seule.',
  'ticket.entry': 'Prix d’entrée',
  'ticket.entrySource.SPOT': 'spot',
  'ticket.entrySource.TWAP': 'TWAP',
  'ticket.entrySourceHint':
    'Le prix d’entrée est le plus bas du spot et du TWAP de règlement. Il ne peut donc jamais être au-dessus du prix sur lequel votre gain sera jugé.',
  'ticket.cap': 'Plafond de gain',
  'ticket.barrier': 'Barrière',
  'ticket.maxPayout': 'Gain maximal',
  'ticket.maxLoss': 'Perte maximale',
  'ticket.rate': 'Premium quotidien',
  'ticket.marginal': 'Taux marginal',
  'ticket.rateHint':
    'Le premium quotidien est le taux moyen sur la capacité que prend votre position. Le taux marginal est celui de la dernière tranche : il grimpe fortement quand la capacité se remplit.',
  'ticket.cost': 'Coût du premium',
  'ticket.cost.1d': '1 jour',
  'ticket.cost.7d': '7 jours',
  'ticket.cost.30d': '30 jours',
  'ticket.utilization': 'Utilisation de la capacité',
  'ticket.utilization.before': 'avant',
  'ticket.utilization.after': 'après',
  'ticket.backing': 'Couverture',
  'ticket.backing.treasury': 'Trésor du token',
  'ticket.backing.hlp': 'HLP',
  'ticket.backingHint':
    'C’est de là que viendrait votre gain. Le trésor du token d’abord, puis le HLP au prorata.',
  'ticket.payoutEligible': 'Éligible au payout dans',
  'ticket.payoutEligibleHint':
    'Un délai après l’ouverture protège contre la manipulation. Avant ce délai, fermer rend le collatéral mais pas le gain.',
  'ticket.quoteExpires': 'Devis valable',
  'ticket.quoteExpired': 'Devis expiré — nouveau devis…',
  'ticket.quoteRefreshed': 'Nouveau devis : les valeurs surlignées ont changé.',
  'ticket.requoting': 'Calcul du devis…',
  'ticket.approve': 'Autoriser {amount} USDG',
  'ticket.approving': 'Autorisation…',
  'ticket.open': 'Ouvrir la position',
  'ticket.opening': 'Ouvrir la position…',
  'ticket.opened': 'Position ouverte',
  'ticket.disabled.status': '{reason}',
  'ticket.disabled.empty': 'Saisissez un collatéral',
  'ticket.disabled.balance': 'Solde USDG insuffisant',
  'ticket.disabled.restricted': 'Ouverture indisponible dans votre région',
  'ticket.capacityRace':
    'La capacité a été prise par une autre position entre le devis et l’envoi. Nouveau devis calculé : vérifiez les valeurs surlignées.',
  'ticket.startsBelow':
    'Au prix de règlement actuel (TWAP {twap}), la position démarrerait marquée à {pct} de son collatéral : les TWAP sont encore au-dessus du spot. Elle remonte à mesure qu’ils rattrapent le prix.',
  'ticket.help.title': 'En trois points',
  'ticket.help.1': 'Vous déposez un collatéral. Il n’y a rien à emprunter et rien à vendre.',
  'ticket.help.2':
    'Le token baisse de 50% : vous doublez. Il monte de 50% : la position est knock-out et le collatéral est perdu.',
  'ticket.help.3': 'Un premium est prélevé chaque jour sur le collatéral tant que la position est ouverte.',
  'ticket.paperNote': 'Mode paper : aucune transaction n’est envoyée.',

  // ── graphe de payoff ──────────────────────────────────────────────────
  'payoff.title': 'Payoff',
  'payoff.x': 'Variation du token',
  'payoff.y': 'PnL',
  'payoff.entry': 'P₀',
  'payoff.barrier': 'Barrière',
  'payoff.cap': 'Plafond',
  'payoff.breakeven': 'Breakeven',
  'payoff.horizon': 'Après',
  'payoff.horizon.0': 'ouverture',
  'payoff.horizon.7': '7 j',
  'payoff.horizon.30': '30 j',
  'payoff.capZone': 'Le gain ne progresse plus au-delà du plafond',
  'payoff.koZone': 'Knock-out : collatéral perdu',
  'payoff.drift': 'Le breakeven descend de {pct} après {days} jours de premium.',

  // ── positions (SPEC §4B) ──────────────────────────────────────────────
  'positions.title': 'Positions',
  'positions.empty': 'Aucune position ouverte.',
  'positions.emptyHint': 'Ouvrez une position short depuis la fiche d’un token éligible.',
  'positions.browse': 'Voir les tokens ouvrables',
  'positions.open': 'Ouvertes',
  'positions.closed': 'Clôturées',
  'positions.col.token': 'Token',
  'positions.col.entry': 'Prix d’entrée',
  'positions.col.settlement': 'Prix de règlement',
  'positions.col.barrier': 'Distance à la barrière',
  'positions.col.premium': 'Premium cumulé',
  'positions.col.runway': 'Autonomie',
  'positions.col.equity': 'Équité',
  'positions.col.pnl': 'PnL',
  'positions.spot': 'spot',
  'positions.spotHint':
    'Le spot est le prix instantané du pool, celui que vous voyez sur DexScreener. Votre position se marque sur les TWAP 24h et 72h, qui lissent les pics : les deux chiffres diffèrent, c’est normal.',
  'positions.settlementHint': 'Plus haut des TWAP 24h et 72h. C’est lui qui fixe le payout.',
  'positions.knockoutHint': 'Plus bas des deux TWAP. C’est lui qui déclenche le knock-out.',
  'positions.knockoutMark': 'Marque knock-out',
  'positions.effectiveBarrier': 'Barrière effective',
  'positions.effectiveBarrierHint':
    'Prix auquel votre équité tombe à zéro une fois le premium payé. Elle descend chaque jour.',
  'positions.runwayDays': '{days} j',
  'positions.runwayHint': 'Jours avant que le premium ne consomme tout le collatéral, au taux courant.',
  'positions.equityHint': 'Équité = valeur V(P) − premium cumulé.',
  'positions.grossPnl': 'PnL brut',
  'positions.grossHint': 'Avant premium. V(P) − collatéral.',
  'positions.badge.windowExtended': 'Fenêtre étendue',
  'positions.badge.notEligible': 'Payout dans {time}',
  'positions.badge.pending': 'Règlement en cours',
  'positions.close': 'Fermer la position',
  'positions.closing': 'Fermer la position…',
  'positions.closeEarly':
    'Avant l’éligibilité au payout, fermer rend au plus le collatéral, moins le premium.',
  'positions.receipt': 'Reçu',
  'positions.samples': 'Échantillons de marquage',
  'positions.samplesHint':
    'Chaque prix qui a servi au calcul des TWAP de cette position, horodaté. La fenêtre de 72 h couvre aussi celle de 24 h.',
  'positions.detail': 'Détail',
  'positions.opened': 'Ouverte le',
  'positions.collateral': 'Collatéral',
  'positions.notional': 'Notionnel',
  'positions.value': 'Valeur V(P)',
  'positions.status.OPEN': 'Ouverte',
  'positions.status.KNOCKED_OUT': 'Knock-out',
  'positions.status.PENDING_SETTLEMENT': 'En règlement',
  'positions.status.SETTLED': 'Réglée',
  'positions.status.CLOSED': 'Fermée',
  'positions.paperShock': 'Simuler un marché qui a bougé',
  'positions.paperShockHint':
    'Outil de test du mode paper : réécrit l’historique récent pour déplacer les deux TWAP d’un coup.',

  // ── reçus (SPEC §4C) ──────────────────────────────────────────────────
  'receipt.title': 'Reçu de règlement',
  'receipt.trigger.KNOCKOUT': 'Knock-out',
  'receipt.trigger.CAP_REACHED': 'Plafond atteint',
  'receipt.trigger.USER_CLOSE': 'Fermeture',
  'receipt.trigger.EXPIRY': 'Collatéral consommé par le premium',
  'receipt.triggeredBy': 'Déclenché par',
  'receipt.triggerPrice': 'Valeur au franchissement',
  'receipt.barrier': 'Barrière',
  'receipt.tx': 'Transaction',
  'receipt.keeper': 'Keeper',
  'receipt.breakdown': 'Décompte',
  'receipt.collateral': 'Collatéral',
  'receipt.premium': 'Premium cumulé',
  'receipt.payout': 'Montant versé',
  'receipt.samples': 'Échantillons ({n})',
  'receipt.samplesHint':
    'La série exacte qui a produit le TWAP déclencheur. Moyenne pondérée par le temps : chaque prix compte pour la durée pendant laquelle il était en vigueur.',
  'receipt.export.json': 'Exporter JSON',
  'receipt.export.csv': 'Exporter CSV',
  'receipt.whyTwap':
    'Le knock-out se déclenche sur le plus bas des deux TWAP, le payout se règle sur le plus haut. Un pic isolé ne suffit donc pas à vous sortir.',
  'receipt.notFound': 'Aucun reçu pour cette position.',
  'receipt.list': 'Reçus',
  'receipt.at': 'Horodatage',
  'receipt.price': 'Prix',

  // ── HLP (SPEC §4D) ────────────────────────────────────────────────────
  'hlp.title': 'HLP',
  'hlp.subtitle':
    'Le HLP couvre les gains des positions short quand le trésor du token ne suffit pas. En échange, il perçoit une part des premiums.',
  'hlp.nav': 'NAV',
  'hlp.sharePrice': 'Prix de la part',
  'hlp.utilization': 'Utilisation',
  'hlp.utilizationCap': 'Plafond global',
  'hlp.apr': 'Rendement réalisé',
  'hlp.reserved': 'Réservé',
  'hlp.reservedHint':
    'Capital qui couvre des positions ouvertes. Il ne peut pas être retiré tant que ces positions courent.',
  'hlp.unreserved': 'Non réservé',
  'hlp.yours': 'Votre position',
  'hlp.value': 'Valeur',
  'hlp.withdrawable': 'Retirable maintenant',
  'hlp.lockup': 'Lockup',
  'hlp.lockupEnds': 'Fin du lockup dans',
  'hlp.lockupNone': 'Aucun lockup en cours',
  'hlp.lockupReset': 'Un nouveau dépôt redémarre le lockup de {days} jours.',
  'hlp.drawdown': 'Drawdown maximal théorique',
  'hlp.drawdownHint':
    'Ce que vous perdriez si toutes les positions couvertes par le HLP atteignaient leur plafond de gain en même temps. Le rendement passé ne dit rien de ce scénario.',
  'hlp.deposit': 'Déposer',
  'hlp.withdraw': 'Retirer',
  'hlp.amount': 'Montant USDG',
  'hlp.exposure': 'Exposition par token',
  'hlp.exposureCap': 'plafond {pct} de la NAV',
  'hlp.depositing': 'Dépôt…',
  'hlp.withdrawing': 'Retrait…',

  // ── portail de risque (SPEC §4E) ──────────────────────────────────────
  'risk.title': 'Avant votre première position',
  'risk.1': 'Si le token monte de 50%, la position est knock-out et je perds tout mon collatéral.',
  'risk.2': 'Le premium est prélevé chaque jour sur mon collatéral tant que la position est ouverte.',
  'risk.3':
    'Le règlement se fait sur des moyennes TWAP, pas sur le prix spot que je vois ailleurs.',
  'risk.accept': 'J’ai compris, continuer',

  // ── notifications (SPEC §7.6) ─────────────────────────────────────────
  'notify.knockout': '{symbol} : position knock-out',
  'notify.knockoutBody': 'Le TWAP a franchi la barrière. Collatéral perdu : {amount}.',
  'notify.settled': '{symbol} : position réglée',
  'notify.settledBody': 'Montant versé : {amount}.',
  'notify.approach': '{symbol} : barrière à {pct}',
  'notify.approachBody': 'Le TWAP de knock-out se rapproche de la barrière.',
  'notify.eligible': '{symbol} : éligible au payout',
  'notify.eligibleBody': 'Le délai post-ouverture est écoulé.',
  'notify.viewReceipt': 'Voir le reçu',
  'notify.dismiss': 'Fermer',

  // ── erreurs (SPEC §7.5 — jamais un nom d’erreur brut) ────────────────
  'errors.QuoteExpired': 'Le devis a expiré. Un nouveau devis est calculé.',
  'errors.CapacityExceeded': 'Capacité insuffisante sur ce token pour ce montant.',
  'errors.CapacityExceeded.max': 'Capacité insuffisante : {max} de collatéral au plus.',
  'errors.TokenNotEligible': 'Ce token n’est pas ouvrable pour le moment.',
  'errors.OracleStale': 'L’oracle est en retard : l’ouverture reprend au prochain échantillon.',
  'errors.InsufficientBalance': 'Solde USDG insuffisant.',
  'errors.InsufficientAllowance': 'Autorisation USDG insuffisante.',
  'errors.CollateralTooSmall': 'Collatéral minimum : {min}.',
  'errors.PayoutNotEligible': 'Payout pas encore éligible.',
  'errors.Paused': 'Le protocole est en pause sur ce token.',
  'errors.Restricted': 'Indisponible dans votre région.',
  'errors.WithdrawExceedsUnreserved': 'Ce montant dépasse la part non réservée.',
  'errors.LockupActive': 'Le lockup est encore en cours.',
  'errors.WalletNotConnected': 'Aucun wallet connecté. Les écritures ne sont pas encore branchées sur ce mode.',
  'errors.IndexerUnavailable': 'L’indexeur ne répond pas.',
  'errors.Unknown': 'Une erreur inattendue s’est produite.',

  'access.unknownRegion': 'Votre région n’a pas pu être déterminée.',
  'access.restricted': 'Ce produit n’est pas disponible dans votre région.',

  // ── commun ────────────────────────────────────────────────────────────
  'common.days': '{n} j',
  'common.hours': '{n} h',
  'common.minutes': '{n} min',
  'common.seconds': '{n} s',
  'common.loading': 'Chargement…',
  'common.cancel': 'Annuler',
  'common.close': 'Fermer',
  'common.never': 'jamais',
} as const

export type MessageKey = keyof typeof fr
