import { useAgents } from "@/hooks/use-store-data";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, PhoneCall } from "lucide-react";

export default function Team() {
  const { data: agents, isLoading } = useAgents();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold">Team Management</h1>
          <p className="text-muted-foreground mt-1">Manage your agents and staff members.</p>
        </div>
        <Button className="shadow-lg shadow-primary/20"><UserPlus className="w-4 h-4 mr-2" /> Add Member</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {[1,2,3].map(i => <div key={i} className="h-40 bg-muted/50 rounded-2xl animate-pulse"></div>)}
        </div>
      ) : agents?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No team members yet</h3>
          <p className="text-muted-foreground mb-4">Add confirmation agents to start assigning orders.</p>
          <Button variant="outline">Invite Agent</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents?.map((agent: any) => (
            <Card key={agent.id} className="rounded-2xl border-border/50 overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-16 bg-gradient-to-r from-primary/20 to-accent"></div>
              <CardContent className="px-6 pb-6 pt-0 relative">
                <Avatar className="w-16 h-16 border-4 border-card absolute -top-8 left-6">
                  <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${agent.username}&backgroundColor=221,83,53`} />
                  <AvatarFallback>{agent.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                
                <div className="mt-10">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-bold">{agent.username}</h3>
                      <p className="text-sm text-muted-foreground capitalize">{agent.role}</p>
                    </div>
                    <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">Active</Badge>
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-border flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1"><PhoneCall className="w-3 h-3 mr-2"/> Performance</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
