import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateItem } from "@/hooks/use-items";
import { insertItemSchema, type InsertItem } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function CreateItemDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createItem = useCreateItem();

  const form = useForm<InsertItem>({
    resolver: zodResolver(insertItemSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
    },
  });

  const onSubmit = (data: InsertItem) => {
    createItem.mutate(data, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        toast({
          title: "Success",
          description: "Item created successfully",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="glow-button bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 h-12 rounded-xl shadow-lg shadow-primary/20">
          <Plus className="mr-2 h-5 w-5" />
          Add New Item
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-card border-white/10 text-card-foreground p-6 rounded-2xl shadow-2xl backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold font-display">Create Item</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Title</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g. Project Alpha" 
                      className="bg-secondary/50 border-white/5 focus:border-primary/50 focus:ring-primary/20 h-11 rounded-lg"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Category</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g. Work, Personal, Ideas" 
                      className="bg-secondary/50 border-white/5 focus:border-primary/50 focus:ring-primary/20 h-11 rounded-lg"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground">Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Brief details about this item..." 
                      className="resize-none bg-secondary/50 border-white/5 focus:border-primary/50 focus:ring-primary/20 min-h-[100px] rounded-lg"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl font-semibold bg-primary hover:bg-primary/90 text-white"
              disabled={createItem.isPending}
            >
              {createItem.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Item"
              )}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
