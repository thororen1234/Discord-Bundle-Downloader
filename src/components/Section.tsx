import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
    icon: LucideIcon;
    title: string;
    badge?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
}

export function Section({ icon: Icon, title, badge, action, children }: Props) {
    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-400">
                <Icon size={18} />
                {title}
                {badge}
                {action && <span className="ml-auto">{action}</span>}
            </div>
            {children}
        </section>
    );
}
