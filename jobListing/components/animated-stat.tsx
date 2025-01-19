import { useCountAnimation } from "@/hooks/use-count-animation";
import { DivideIcon as LucideIcon } from "lucide-react";

interface AnimatedStatProps {
  value: number;
  label: string;
  icon: LucideIcon;
  iconColor: string;
  valueColor: string;
}

export function AnimatedStat({ value, label, icon: Icon, iconColor, valueColor }: AnimatedStatProps) {
  const animatedValue = useCountAnimation(value);

  return (
    <div className="bg-[#111111] border border-purple-900/20 rounded-lg p-4 flex items-center justify-between">
      <div className="flex flex-col">
        <span className={`text-lg sm:text-2xl font-bold ${valueColor}`}>
          {animatedValue.toLocaleString()}
        </span>
        <span className="text-[10px] sm:text-xs text-gray-500">{label}</span>
      </div>
      <Icon className={`h-5 w-5 ${iconColor}`} />
    </div>
  );
}