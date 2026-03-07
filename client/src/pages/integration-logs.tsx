import { useIntegrationLogs } from "@/hooks/use-store-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Activity, CheckCircle, XCircle } from "lucide-react";

export default function IntegrationLogs() {
  const { data: logs, isLoading } = useIntegrationLogs(200);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-display font-bold" data-testid="text-logs-title">Journal des Intégrations</h1>
        <p className="text-muted-foreground mt-1">Historique de toutes les tentatives de synchronisation et d'envoi.</p>
      </div>

      <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Fournisseur</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : !logs?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <Activity className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    Aucun log d'intégration pour le moment.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log: any) => (
                  <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{log.provider}</Badge>
                    </TableCell>
                    <TableCell className="text-sm capitalize">{log.action.replace(/_/g, ' ')}</TableCell>
                    <TableCell>
                      {log.status === 'success' ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                          <CheckCircle className="w-3 h-3 mr-1" /> Succès
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                          <XCircle className="w-3 h-3 mr-1" /> Échec
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm max-w-[400px] truncate">{log.message}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
