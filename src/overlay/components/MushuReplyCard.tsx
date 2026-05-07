import { ShineBorder } from "@/components/ui/shine-border";
import { cn } from "@/lib/utils";

export function MushuReplyCard({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        "relative min-h-0 w-full max-w-[408px] overflow-hidden rounded-[18px] p-4 text-left sm:p-5",
        className,
      )}
    >
      <ShineBorder
        borderWidth={1}
        duration={6}
        shineColor={["#a5d11d", "#d1ff3a", "#e7ff7a"]}
        className="rounded-[18px]"
      />
      <div className="relative z-10 flex flex-col gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">Mushu</span>
        <p className="text-[14px] font-medium leading-[1.5] text-foreground">{text}</p>
      </div>
    </div>
  );
}
