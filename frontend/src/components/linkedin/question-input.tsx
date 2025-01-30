import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LinkedInQuestion } from '../../pages/LinkedIn';

interface QuestionInputProps {
  question: LinkedInQuestion;
  onUpdateAnswer?: (value: string | string[] | null) => void;
  disabled?: boolean;
}

export function QuestionInput({ question, onUpdateAnswer, disabled = false }: QuestionInputProps) {
  const inputClasses = "bg-background/50 border-border/30 focus:border-accent/50 focus:ring-accent/20";
  const labelClasses = "text-sm font-medium text-foreground/80";

  // Check if the question is about years of experience
  const isExperienceQuestion = question.question.toLowerCase().includes('how many years of');

  const renderExperienceButtons = () => {
    return (
      <div className="flex flex-wrap gap-2 mb-3">
        {[1, 2, 3, 4, 5].map((years) => (
          <Button
            key={years}
            variant="outline"
            size="sm"
            onClick={() => onUpdateAnswer?.(years.toString())}
            className={cn(
              "transition-all duration-200",
              question.currentAnswer === years.toString()
                ? "bg-accent text-accent-foreground hover:bg-accent/90"
                : "hover:bg-accent/10"
            )}
            disabled={disabled}
          >
            {years} {years === 1 ? 'year' : 'years'}
          </Button>
        ))}
      </div>
    );
  };

  switch (question.type) {
    case 'Text Input':
      return (
        <div className="space-y-3">
          {isExperienceQuestion && renderExperienceButtons()}
          <Input
            type="text"
            value={question.currentAnswer?.toString() || ''}
            onChange={(e) => onUpdateAnswer?.(e.target.value)}
            disabled={disabled}
            className={cn(
              "w-full",
              inputClasses,
              "placeholder:text-muted-foreground/50",
              "focus:ring-2 focus:ring-offset-0"
            )}
          />
        </div>
      );

    case 'Dropdown':
      return (
        <div className="grid grid-cols-1 gap-2">
          {question.options?.map((option) => (
            <div
              key={option}
              onClick={() => !disabled && onUpdateAnswer?.(option)}
              className={cn(
                "w-full p-3 rounded-lg border cursor-pointer transition-all duration-200",
                "hover:bg-accent/10",
                option === question.currentAnswer 
                  ? "border-accent/50 bg-accent/10 text-accent" 
                  : "border-border/30 text-foreground",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {option}
            </div>
          ))}
        </div>
      );

    case 'Radio Button':
      return (
        <RadioGroup
          value={question.currentAnswer?.toString()}
          onValueChange={(value) => onUpdateAnswer?.(value)}
          disabled={disabled}
          className="space-y-2"
        >
          {question.options?.map((option) => (
            <Label
              key={option}
              htmlFor={`${question.question}-${option}`}
              className={cn(
                "flex items-center w-full p-3 rounded-lg border cursor-pointer",
                "hover:bg-accent/5 transition-colors",
                question.currentAnswer === option ? "border-accent/50 bg-accent/5" : "border-border/30"
              )}
            >
              <RadioGroupItem 
                value={option} 
                id={`${question.question}-${option}`}
                className="border-border/30 text-accent data-[state=checked]:bg-accent data-[state=checked]:border-accent"
              />
              <span className="ml-2">{option}</span>
            </Label>
          ))}
        </RadioGroup>
      );

    case 'Multiple Select (Checkbox)':
      const selectedOptions = Array.isArray(question.currentAnswer)
        ? question.currentAnswer
        : question.currentAnswer ? [question.currentAnswer] : [];
      
      return (
        <div className="grid grid-cols-2 gap-4">
          {question.options?.map((option) => (
            <div key={option} className="flex items-center space-x-2 rounded-lg p-2 hover:bg-accent/5 transition-colors">
              <Checkbox
                id={`${question.question}-${option}`}
                checked={selectedOptions.includes(option)}
                onCheckedChange={(checked) => {
                  if (!onUpdateAnswer) return;
                  const newSelected = checked
                    ? [...selectedOptions, option]
                    : selectedOptions.filter(o => o !== option);
                  onUpdateAnswer(newSelected);
                }}
                disabled={disabled}
                className="border-border/30 data-[state=checked]:bg-accent data-[state=checked]:border-accent"
              />
              <Label 
                htmlFor={`${question.question}-${option}`}
                className={labelClasses}
              >
                {option}
              </Label>
            </div>
          ))}
        </div>
      );

    default:
      return <p className="text-muted-foreground italic">{question.currentAnswer || 'No answer provided'}</p>;
  }
}