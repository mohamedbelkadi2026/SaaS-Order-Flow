import {Link} from 'wouter';

export default function DataDeletionPage(){
 return <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-900"><article className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm space-y-6">
  <Link href="/" className="text-indigo-700">← TajerGrow</Link>
  <h1 className="text-3xl font-bold">Suppression des données</h1>
  <p>Pour demander la suppression des données de votre compte TajerGrow ou de votre intégration WhatsApp, écrivez à <a className="text-indigo-700 underline" href="mailto:contact@tajergrow.com">contact@tajergrow.com</a> depuis l’adresse du compte.</p>
  <ol className="list-decimal pl-6 space-y-3">
   <li>Indiquez la boutique concernée et précisez si la demande porte sur la connexion WhatsApp, une conversation, une commande ou l’ensemble du compte. Ne transmettez aucun jeton Meta, mot de passe ou code de vérification.</li>
   <li>Nous vérifions votre identité et votre droit d’accès avant de traiter la demande. Un client final peut préciser le marchand concerné et la référence de sa commande ; nous coordonnons alors la demande avec ce marchand.</li>
   <li>Nous confirmons le périmètre, l’avancement et la clôture de la demande. Les éventuelles données soumises à une obligation de conservation et leur durée sont précisées dans cette réponse.</li>
  </ol>
  <h2 className="text-xl font-semibold">Arrêter la connexion WhatsApp</h2>
  <p>Dans Automation &amp; IA → Connexion WhatsApp → WhatsApp officiel, choisissez « Déconnecter ». Le jeton enregistré est effacé et les envois via cette connexion sont désactivés. Les commandes et l’historique déjà enregistrés ne sont pas supprimés par cette action.</p>
  <p>Vous pouvez également retirer l’accès de TajerGrow dans les paramètres des intégrations professionnelles de votre compte Meta. Une demande de suppression chez TajerGrow ne supprime pas les copies déjà présentes chez les destinataires ou les données conservées directement par Meta.</p>
  <Link href="/privacy" className="text-indigo-700 underline">Politique de confidentialité</Link>
 </article></main>;
}
