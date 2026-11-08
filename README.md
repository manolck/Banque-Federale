# Banque Fédérale

Registre des services bancaires RP. L'agence Van Horn, le préfixe `VH` et les collections `pret_*` restent inchangés.

## Installation sur le Raspberry Pi

1. Installe les dépendances : `npm install`.
2. Copie `.env.example` vers `.env`.
3. Renseigne `POCKETBASE_URL` (en local, `http://127.0.0.1:8090`), le courriel et le mot de passe **superuser** PocketBase, `SESSION_SECRET` (32 caractères minimum) et les variables Discord.
4. Sur la machine PocketBase, crée ce compte si besoin : `./pocketbase superuser upsert EMAIL MOT_DE_PASSE` (mêmes valeurs que `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD`). Les collections sont créées au démarrage par Node ; leurs règles n’autorisent que ce superuser.
5. Lance le registre : `npm start`.
6. Lance le bot dans un second process : `npm run bot`.
7. `DISCORD_MISSION_FORUM_ID` est le forum des ordres de mission. Les étiquettes attendues sont `texas`, `louisiane` et `à faire`.
8. Planning Europe/Paris du bot Discord :
   - **~1 min** — souscriptions et avis déclenchés au clic (paiement, clôture, rappel…).
   - **16 h** — automatisations daily : ordres de mission, intérêts AV, capitalisation Goldstein, saisie gage, etc.
   - **18 h** — tirage des taux des fonds spéculatifs + message Discord d’attente (`DISCORD_FUNDS_CHANNEL_ID`, typiquement le dimanche).
   - **19 h** — application sur les comptes, édition Discord des résultats (1 h après le tirage), puis actualisation du forum des fonds.
   Les dossiers en pause ou clôturés ne bougent pas à la séance.

Le navigateur parle uniquement à l'API Node. PocketBase reste sur la machine.

## Sécurité

- Les mots de passe sont hashés côté serveur avec bcrypt.
- La session est stockée dans un cookie HttpOnly.
- Les rôles sont vérifiés côté API.
- Les collections PocketBase refusent l'accès anonyme et l'accès utilisateur. Seul le compte admin du process Node lit et écrit.
- Les identifiants PocketBase restent dans les variables d'environnement du Raspberry Pi.
- Le compte admin protégé ne peut pas être supprimé par les autres rôles.

## Rôles

- `admin` : tout gérer.
- `directeur` : gérer co-directeurs/employés, prêts, clients, logs.
- `co_directeur` : gérer employés, prêts, clients, logs.
- `employe` : gérer ses prêts et clients.

## Fonctionnalités

- Gestion clients.
- Gestion prêts avec échéances hebdomadaires fixes.
- Première échéance à J+7.
- Validation/annulation de paiements.
- Modification et suppression complète de prêts.
- Logs serveur pour les actions importantes.
