# Banque Fédérale

Registre des services bancaires RP. L'agence Van Horn, le préfixe `VH` et les collections `pret_*` restent inchangés.

## Installation sur le Raspberry Pi

1. Installe les dépendances : `npm install`.
2. Copie `.env.example` vers `.env`.
3. Renseigne `POCKETBASE_URL` (en local, `http://127.0.0.1:8090`), le courriel et le mot de passe admin PocketBase, `SESSION_SECRET` (32 caractères minimum) et les variables Discord.
4. Les collections sont créées au démarrage par le process Node. Leurs règles n'autorisent que le compte admin.
5. Lance le registre : `npm start`.
6. Lance le bot dans un second process : `npm run bot`.
7. `DISCORD_MISSION_FORUM_ID` est le forum des ordres de mission. Les étiquettes attendues sont `texas`, `louisiane` et `à faire`.
8. `DISCORD_FUNDS_CHANNEL_ID` est le salon texte qui reçoit, chaque vendredi à 18 h (heure de Paris), un relevé par palier. Le même résultat est appliqué aux dossiers ouverts de ce palier. Les dossiers en pause ou clôturés ne bougent pas.

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
