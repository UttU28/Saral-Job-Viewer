import { useCallback, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  GraduationCap,
  Layers,
  Shuffle,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_INTERVIEW_CATEGORY_ID,
  getInterviewCategory,
  INTERVIEW_CATEGORIES,
  type InterviewCategory,
  type InterviewCategoryId,
  type InterviewQuestion,
  type InterviewQuestionLevel,
} from "@/data/interviewQuestions";
import { cn } from "@/lib/utils";

const LEVEL_ORDER: readonly InterviewQuestionLevel[] = ["beginner", "intermediate", "advanced", "others"];

const LEVEL_LABEL: Record<InterviewQuestionLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  others: "Others",
};

const LEVEL_BADGE: Record<InterviewQuestionLevel, string> = {
  beginner: "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  intermediate: "border-sky-500/35 bg-sky-500/10 text-sky-900 dark:text-sky-100",
  advanced: "border-violet-500/35 bg-violet-500/12 text-violet-900 dark:text-violet-100",
  others: "border-amber-500/40 bg-amber-500/12 text-amber-950 dark:text-amber-100",
};

function filterByLevel(
  items: readonly InterviewQuestion[],
  level: InterviewQuestionLevel | "all",
): InterviewQuestion[] {
  if (level === "all") return [...items];
  return items.filter((q) => q.level === level);
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function useInterviewDeck(questions: readonly InterviewQuestion[]) {
  const [levelFilter, setLevelFilter] = useState<InterviewQuestionLevel | "all">("all");
  const [order, setOrder] = useState<InterviewQuestion[]>(() => [...questions]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const filtered = useMemo(() => filterByLevel(order, levelFilter), [order, levelFilter]);
  const total = filtered.length;
  const at = total === 0 ? 0 : Math.min(Math.max(0, index), total - 1);
  const current = total > 0 ? filtered[at] : null;

  const goPrev = useCallback(() => {
    if (total === 0) return;
    setShowAnswer(false);
    setIndex((i) => {
      const c = Math.min(Math.max(0, i), total - 1);
      return (c - 1 + total) % total;
    });
  }, [total]);

  const goNext = useCallback(() => {
    if (total === 0) return;
    setShowAnswer(false);
    setIndex((i) => {
      const c = Math.min(Math.max(0, i), total - 1);
      return (c + 1) % total;
    });
  }, [total]);

  const onFilterChange = (next: InterviewQuestionLevel | "all") => {
    setLevelFilter(next);
    setIndex(0);
    setShowAnswer(false);
  };

  const onShuffle = () => {
    const next = filterByLevel([...questions], levelFilter);
    shuffleInPlace(next);
    setOrder(next);
    setIndex(0);
    setShowAnswer(false);
  };

  const onResetOrder = () => {
    setOrder([...questions]);
    setIndex(0);
    setShowAnswer(false);
  };

  return {
    levelFilter,
    onFilterChange,
    onShuffle,
    onResetOrder,
    current,
    at,
    total,
    showAnswer,
    setShowAnswer,
    goPrev,
    goNext,
  };
}

function InterviewCategoryPicker({
  categoryId,
  onCategoryChange,
}: Readonly<{
  categoryId: InterviewCategoryId;
  onCategoryChange: (id: InterviewCategoryId) => void;
}>) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-themed"
      role="tablist"
      aria-label="Interview category"
    >
      {INTERVIEW_CATEGORIES.map((cat) => (
        <Button
          key={cat.id}
          type="button"
          role="tab"
          aria-selected={categoryId === cat.id}
          variant={categoryId === cat.id ? "default" : "outline"}
          size="sm"
          className={cn(
            "rounded-xl shrink-0 gap-1.5",
            categoryId === cat.id && "shadow-sm",
          )}
          onClick={() => onCategoryChange(cat.id)}
        >
          {cat.label}
          <span className="text-[10px] tabular-nums opacity-80">({cat.questions.length})</span>
        </Button>
      ))}
    </div>
  );
}

function InterviewLevelFilters({
  levelFilter,
  onFilterChange,
  onShuffle,
  onResetOrder,
}: Readonly<{
  levelFilter: InterviewQuestionLevel | "all";
  onFilterChange: (next: InterviewQuestionLevel | "all") => void;
  onShuffle: () => void;
  onResetOrder: () => void;
}>) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant={levelFilter === "all" ? "secondary" : "outline"}
        size="sm"
        className="rounded-xl gap-1.5"
        onClick={() => onFilterChange("all")}
      >
        <Layers className="h-4 w-4" aria-hidden />
        All levels
      </Button>
      {LEVEL_ORDER.map((lvl) => (
        <Button
          key={lvl}
          type="button"
          variant={levelFilter === lvl ? "secondary" : "outline"}
          size="sm"
          className={cn("rounded-xl", levelFilter === lvl && "border-primary/30")}
          onClick={() => onFilterChange(lvl)}
        >
          {LEVEL_LABEL[lvl]}
        </Button>
      ))}
      <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1.5 ml-auto" onClick={onShuffle}>
        <Shuffle className="h-4 w-4" aria-hidden />
        Shuffle
      </Button>
      <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={onResetOrder}>
        Reset order
      </Button>
    </div>
  );
}

function InterviewFlashcard({
  current,
  at,
  total,
  showAnswer,
  setShowAnswer,
  goPrev,
  goNext,
}: Readonly<{
  current: InterviewQuestion;
  at: number;
  total: number;
  showAnswer: boolean;
  setShowAnswer: (v: boolean | ((b: boolean) => boolean)) => void;
  goPrev: () => void;
  goNext: () => void;
}>) {
  return (
    <Card
      className={cn(
        "border-2 shadow-md transition-[border-color,box-shadow] duration-200",
        "border-primary/20 bg-card/95",
        showAnswer && "border-primary/40 shadow-primary/10",
      )}
    >
      <CardHeader className="space-y-3 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={cn(
              "text-xs font-semibold uppercase tracking-wide rounded-full border px-2.5 py-0.5",
              LEVEL_BADGE[current.level],
            )}
          >
            {LEVEL_LABEL[current.level]}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {at + 1} / {total}
          </span>
        </div>
        <CardTitle className="text-xl sm:text-2xl leading-snug font-semibold font-display text-balance">
          {current.question}
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          {showAnswer ? "Answer side" : "Question side — tap below or the card body to reveal"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <button
          type="button"
          className={cn(
            "w-full rounded-xl border border-border/90 bg-muted/25 text-left p-4 sm:p-5 min-h-[8rem] sm:min-h-[9rem]",
            "transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          )}
          onClick={() => setShowAnswer((v) => !v)}
          aria-expanded={showAnswer}
        >
          {showAnswer ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              <p className="text-sm sm:text-base text-foreground/95 whitespace-pre-wrap leading-relaxed">
                {current.answer}
              </p>
              {current.imageUrl ? (
                <figure className="space-y-2">
                  <img
                    src={current.imageUrl}
                    alt={current.imageAlt ?? "Diagram for this answer"}
                    className="w-full max-h-64 sm:max-h-80 object-contain rounded-lg border border-border/60 bg-background/50"
                    loading="lazy"
                  />
                </figure>
              ) : null}
            </div>
          ) : (
            <div className="flex h-full min-h-[6rem] flex-col items-center justify-center gap-2 text-muted-foreground">
              <BookOpen className="h-8 w-8 opacity-60" aria-hidden />
              <span className="text-sm font-medium">Tap to show answer</span>
            </div>
          )}
        </button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant={showAnswer ? "secondary" : "default"}
            size="sm"
            className="rounded-xl gap-2"
            onClick={() => setShowAnswer((v) => !v)}
          >
            {showAnswer ? (
              <>
                <EyeOff className="h-4 w-4" aria-hidden />
                Hide answer
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" aria-hidden />
                Show answer
              </>
            )}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-xl shrink-0"
              onClick={goPrev}
              aria-label="Previous question"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-xl shrink-0"
              onClick={goNext}
              aria-label="Next question"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InterviewQuestionBankList({ questions }: Readonly<{ questions: readonly InterviewQuestion[] }>) {
  return (
    <section className="space-y-4 pt-2 border-t border-border/70" aria-labelledby="interview-bank-heading">
      <div className="space-y-1">
        <h2 id="interview-bank-heading" className="text-base sm:text-lg font-semibold text-foreground font-display">
          All questions
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Expand any row for the full answer (separate from the flashcard above).
        </p>
      </div>
      <Accordion type="multiple" className="w-full rounded-2xl border border-border bg-card/50 p-1 sm:p-2 shadow-sm">
        {questions.map((q, i) => (
          <AccordionItem key={q.id} value={q.id} className="border-border/60 px-2 sm:px-3">
            <AccordionTrigger className="text-left text-sm sm:text-base font-medium leading-snug hover:no-underline py-4 gap-2 sm:gap-3 text-foreground/95 [&>svg]:shrink-0">
              <span className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <span
                  className="tabular-nums text-muted-foreground text-sm font-semibold w-9 sm:w-11 shrink-0 text-right select-none"
                  aria-label={`Question ${i + 1}`}
                >
                  {i + 1}.
                </span>
                <span className="min-w-0 flex-1 pr-1 leading-snug">{q.question}</span>
                <span
                  className={cn(
                    "inline-flex w-fit shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap",
                    LEVEL_BADGE[q.level],
                  )}
                >
                  {LEVEL_LABEL[q.level]}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 border-t border-border/50 pt-3 pb-1 pl-9 sm:pl-11">
                <p className="text-sm sm:text-[15px] text-foreground/95 whitespace-pre-wrap leading-relaxed">
                  {q.answer}
                </p>
                {q.imageUrl ? (
                  <img
                    src={q.imageUrl}
                    alt={q.imageAlt ?? "Diagram"}
                    className="w-full max-h-72 object-contain rounded-lg border border-border/60 bg-background/50"
                    loading="lazy"
                  />
                ) : null}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function sourceAttribution(category: InterviewCategory): { linkLabel: string; footer: string } {
  const url = category.sourceUrl ?? "";
  if (url.includes("datacamp.com")) {
    return {
      linkLabel: "View original on DataCamp",
      footer: `Content is from the DataCamp ${category.label} interview guide (personal study copy in Saral Job Viewer).`,
    };
  }
  if (url.includes("roadmap.sh")) {
    return {
      linkLabel: "View original on roadmap.sh",
      footer:
        "Content is from the public roadmap.sh DevOps interview guide; diagrams load from their CDN when a card includes one.",
    };
  }
  return {
    linkLabel: "View original source",
    footer: category.sourceNote ?? "",
  };
}

function InterviewCategoryContent({ category }: Readonly<{ category: InterviewCategory }>) {
  const attribution = sourceAttribution(category);
  const deck = useInterviewDeck(category.questions);

  return (
    <>
      <InterviewLevelFilters
        levelFilter={deck.levelFilter}
        onFilterChange={deck.onFilterChange}
        onShuffle={deck.onShuffle}
        onResetOrder={deck.onResetOrder}
      />

      {deck.current ? (
        <InterviewFlashcard
          current={deck.current}
          at={deck.at}
          total={deck.total}
          showAnswer={deck.showAnswer}
          setShowAnswer={deck.setShowAnswer}
          goPrev={deck.goPrev}
          goNext={deck.goNext}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No questions in this filter.</p>
      )}

      <InterviewQuestionBankList questions={category.questions} />

      {attribution.footer ? (
        <p className="text-sm text-muted-foreground leading-relaxed">{attribution.footer}</p>
      ) : null}
    </>
  );
}

export default function Interview() {
  const [categoryId, setCategoryId] = useState<InterviewCategoryId>(DEFAULT_INTERVIEW_CATEGORY_ID);
  const category = useMemo(() => getInterviewCategory(categoryId), [categoryId]);

  const onCategoryChange = (id: InterviewCategoryId) => {
    setCategoryId(id);
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
        <div className="min-h-full flex flex-col">
          <div className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-5 sm:space-y-6 min-w-0">
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card/50 to-emerald-500/[0.06] p-6 sm:p-7 shadow-sm shadow-primary/5">
              <div className="flex items-start gap-4 sm:gap-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 border border-primary/25">
                  <GraduationCap className="h-6 w-6 text-primary" aria-hidden />
                </div>
                <div className="space-y-2 min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Interview prep</p>
                  <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground">{category.title}</h1>
                  {category.sourceUrl ? (
                    <a
                      href={category.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      {sourceAttribution(category).linkLabel}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </div>
            </div>

            <InterviewCategoryPicker categoryId={categoryId} onCategoryChange={onCategoryChange} />

            <InterviewCategoryContent key={categoryId} category={category} />
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}
