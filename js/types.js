// Eigentümer: B – nur JSDoc-Typedefs (docs/ARCHITEKTUR.md §3). Keine Laufzeit-Exporte außer dem Marker.

/** @typedef {{schema:1, device:Device, lists:Record<string,List>, order:string[], settings:{}}} AppState */
/** @typedef {{id:string, name:string}} Device   // id "d_"+10 Zeichen; name Standard "" (wird beim ersten Teilen erfragt) */
/** @typedef {{
 *   id:string,            // "l_"+10 Zeichen [a-z0-9], crypto.getRandomValues; Beispielliste fest "l_beispiel01"
 *   aliases:string[],     // fremde Listen-IDs, die mit dieser Liste verknüpft wurden
 *   name:string, createdAt:number, updatedAt:number,   // ms seit Epoch
 *   stableShown:boolean,  // Hinweis „Rangliste ist jetzt aussagekräftig“ schon gezeigt
 *   options:Option[], history:Duel[], partners:PartnerRanking[] }} List */
/** @typedef {{id:string, name:string, rating:number, duels:number, wins:number, draws:number, losses:number}} Option
 *   // id "o_"+6 Zeichen, eindeutig je Liste; Start rating 1000 */
/** @typedef {{a:string, b:string, s:1|0.5|0, da:number, db:number, t:number}} Duel
 *   // s = Ergebnis aus Sicht von a; da/db = Wertungsänderung (für Rückgängig); history: ältestes zuerst */
/** @typedef {{deviceId:string, name:string, receivedAt:number, sentAt:number,
 *   options:{name:string, rating:number, duels:number}[]}} PartnerRanking   // je deviceId nur der neueste Eintrag */
/** @typedef {{v:1, l:string, n:string, p:string, d:string, t:number,
 *   o:[string, number, number][], a?:string[]}} ShareData
 *   // v Formatversion, l Listen-ID, n Listenname, p Name der Person, d Geräte-ID,
 *   // t Sekunden seit Epoch, o [Name, Wertung gerundet, Duelle] nach Wertung absteigend, a Aliase der Liste */

export {};
