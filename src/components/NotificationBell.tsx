import { Bell, Check, Trash2, Clock } from 'lucide-react';
import { useNotifications, Notification } from '@/context/NotificationContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, dismissNotification } = useNotifications();

  const activeNotifs = notifications.filter(n => !n.is_dismissed);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-muted/60 transition-colors group">
          <Bell className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center p-0 bg-red-500 border-none text-[10px] animate-in zoom-in"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px] p-0 skeu-card shadow-2xl border-primary/20">
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
          <h3 className="font-heading font-bold text-sm text-foreground">Notifications</h3>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {unreadCount} Unread
          </span>
        </div>
        
        <ScrollArea className="h-[400px]">
          <div className="divide-y divide-border/50">
            {activeNotifs.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Bell className="w-8 h-8 text-muted-foreground/20 mx-auto" />
                <p className="text-xs text-muted-foreground">No new notifications</p>
              </div>
            ) : (
              activeNotifs.map((notif) => (
                <div 
                  key={notif.id} 
                  className={cn(
                    "p-4 transition-colors relative group",
                    !notif.is_read ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        {!notif.is_read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                        <p className={cn("text-xs font-bold leading-none", !notif.is_read ? "text-foreground" : "text-muted-foreground")}>
                          {notif.title}
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {notif.message}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!notif.is_read && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0 hover:text-primary" 
                          onClick={() => markAsRead(notif.id)}
                          title="Mark as read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0 hover:text-destructive" 
                        onClick={() => dismissNotification(notif.id)}
                        title="Dismiss"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        
        {activeNotifs.length > 0 && (
          <div className="p-2 border-t border-border bg-muted/10">
            <Button variant="ghost" size="sm" className="w-full text-[10px] h-8 uppercase font-bold tracking-widest text-muted-foreground hover:text-primary">
              View All History
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
