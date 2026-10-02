/**
 * Render-level tests for the shadcn/ui wrappers: each one mounts, forwards its
 * props and applies its variant classes. Behaviour belongs to Radix/cmdk.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandPanel,
  CommandSeparator,
  CommandShortcut,
} from "./command";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./context-menu";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty";
import { Input } from "./input";
import { Kbd, KbdGroup } from "./kbd";
import { Label } from "./label";
import { Progress } from "./progress";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./resizable";
import { ScrollArea, ScrollBar } from "./scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Separator } from "./separator";
import { Slider } from "./slider";
import { Switch } from "./switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

describe("ui primitives", () => {
  it("Badge and Button apply variants and asChild", () => {
    render(
      <>
        <Badge variant="destructive">bad</Badge>
        <Badge>plain</Badge>
        <Button variant="outline" size="sm">
          outline
        </Button>
        <Button asChild>
          <a href="#x">link</a>
        </Button>
      </>
    );
    expect(screen.getByText("bad")).toHaveClass("bg-destructive");
    expect(screen.getByText("plain")).toHaveClass("bg-primary");
    expect(screen.getByRole("button", { name: "outline" })).toHaveClass("border");
    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute("href", "#x");
  });

  it("Card, Empty, Kbd, Label, Input, Separator and Progress render their parts", () => {
    render(
      <>
        <Card data-testid="card">
          <CardHeader>
            <CardTitle>Title</CardTitle>
            <CardDescription>Desc</CardDescription>
          </CardHeader>
          <CardContent>Body</CardContent>
          <CardFooter>Foot</CardFooter>
        </Card>
        <Empty>
          <EmptyHeader>
            <EmptyMedia>m1</EmptyMedia>
            <EmptyMedia variant="icon">m2</EmptyMedia>
            <EmptyTitle>Nothing</EmptyTitle>
            <EmptyDescription>None here</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>actions</EmptyContent>
        </Empty>
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
        </KbdGroup>
        <Label htmlFor="in">Name</Label>
        <Input id="in" />
        <Separator orientation="vertical" data-testid="sep" />
        <Progress data-testid="progress" />
        <Progress value={40} data-testid="progress40" />
      </>
    );
    expect(screen.getByTestId("card")).toHaveTextContent("TitleDescBodyFoot");
    expect(screen.getByText("Nothing")).toBeInTheDocument();
    expect(screen.getByText("m2").parentElement).toHaveAttribute("data-variant", "icon");
    expect(screen.getByText("Ctrl").tagName).toBe("KBD");
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByTestId("sep")).toHaveAttribute("data-orientation", "vertical");
    expect(screen.getByTestId("progress40").firstElementChild).toHaveStyle({
      transform: "translateX(-60%)",
    });
    expect(screen.getByTestId("progress").firstElementChild).toHaveStyle({
      transform: "translateX(-100%)",
    });
  });

  it("form controls: RadioGroup, Switch, Slider", async () => {
    const user = userEvent.setup();
    const onRadio = vi.fn();
    const onSwitch = vi.fn();
    render(
      <>
        <RadioGroup onValueChange={onRadio} aria-label="pick">
          <RadioGroupItem value="a" aria-label="A" />
          <RadioGroupItem value="b" aria-label="B" />
        </RadioGroup>
        <Switch aria-label="toggle" onCheckedChange={onSwitch} />
        <Slider defaultValue={[10]} aria-label="level" />
      </>
    );
    await user.click(screen.getByRole("radio", { name: "B" }));
    await user.click(screen.getByRole("switch", { name: "toggle" }));
    expect(onRadio).toHaveBeenCalledWith("b");
    expect(onSwitch).toHaveBeenCalledWith(true);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "10");
  });

  it("Tabs supports boxed and underline variants", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">A</TabsTrigger>
            <TabsTrigger value="b">B</TabsTrigger>
          </TabsList>
          <TabsContent value="a">Panel A</TabsContent>
          <TabsContent value="b">Panel B</TabsContent>
        </Tabs>
        <Tabs defaultValue="x">
          <TabsList variant="underline">
            <TabsTrigger value="x">X</TabsTrigger>
          </TabsList>
        </Tabs>
      </>
    );
    await user.click(screen.getByRole("tab", { name: "B" }));
    expect(screen.getByText("Panel B")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "X" })).toHaveClass("border-b-2");
    expect(screen.getByRole("tab", { name: "A" })).toHaveClass("rounded-md");
  });

  it("Collapsible and Tooltip open on interaction", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Collapsible>
          <CollapsibleTrigger>more</CollapsibleTrigger>
          <CollapsibleContent>hidden text</CollapsibleContent>
        </Collapsible>
        <Tooltip>
          <TooltipTrigger>hover me</TooltipTrigger>
          <TooltipContent>tip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    expect(screen.queryByText("hidden text")).toBeNull();
    await user.click(screen.getByRole("button", { name: "more" }));
    expect(screen.getByText("hidden text")).toBeInTheDocument();
    await user.hover(screen.getByRole("button", { name: "hover me" }));
    expect((await screen.findAllByText("tip text")).length).toBeGreaterThan(0);
  });

  it("Dialog renders header, body, footer and closes", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog title</DialogTitle>
            <DialogDescription>Dialog desc</DialogDescription>
          </DialogHeader>
          <DialogBody>Dialog body</DialogBody>
          <DialogFooter>
            <DialogClose>done</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
    await user.click(screen.getByRole("button", { name: "open" }));
    const dialog = screen.getByRole("dialog", { name: "Dialog title" });
    expect(within(dialog).getByText("Dialog body")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Select renders groups, labels, separators and items", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select onValueChange={onChange}>
        <SelectTrigger aria-label="fruit">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectSeparator />
            <SelectItem value="pear">Pear</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );
    await user.click(screen.getByRole("combobox", { name: "fruit" }));
    expect(screen.getByText("Fruits")).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Pear" }));
    expect(onChange).toHaveBeenCalledWith("pear");
  });

  it("DropdownMenu renders every item type", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel inset>Label</DropdownMenuLabel>
          <DropdownMenuItem inset onSelect={onSelect}>
            Item <DropdownMenuShortcut>⌘I</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked>Checked</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem>Unchecked</DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="r1">
            <DropdownMenuRadioItem value="r1">Radio</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger inset>More</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Nested</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    await user.click(screen.getByRole("button", { name: "menu" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Checked" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Radio" })).toBeInTheDocument();
    expect(screen.getByText("Nested")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: /Item/ }));
    expect(onSelect).toHaveBeenCalled();
  });

  it("ContextMenu renders every item type", () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>area</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuLabel inset>Ctx label</ContextMenuLabel>
          <ContextMenuItem inset>
            Copy <ContextMenuShortcut>⌘C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem checked>Snap</ContextMenuCheckboxItem>
          <ContextMenuCheckboxItem>Ripple</ContextMenuCheckboxItem>
          <ContextMenuRadioGroup value="a">
            <ContextMenuRadioItem value="a">Opt A</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
          <ContextMenuSub open>
            <ContextMenuSubTrigger inset>Sub</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>Deep</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>
    );
    fireEvent.contextMenu(screen.getByText("area"));
    expect(screen.getByRole("menuitem", { name: /Copy/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: "Snap" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Opt A" })).toBeInTheDocument();
    expect(screen.getByText("Deep")).toBeInTheDocument();
  });

  it("Command renders list parts, and CommandDialog opens", () => {
    const { rerender } = render(
      <Command>
        <CommandInput placeholder="Search" />
        <CommandPanel>
          <CommandList>
            <CommandLoading>Loading…</CommandLoading>
            <CommandEmpty>None</CommandEmpty>
            <CommandGroup heading="Group">
              <CommandItem>
                Alpha <CommandShortcut>A</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </CommandList>
        </CommandPanel>
        <CommandFooter>footer</CommandFooter>
      </Command>
    );
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByText("footer")).toBeInTheDocument();

    rerender(
      <CommandDialog open onOpenChange={() => {}} title="Palette" description="Find things">
        <CommandInput />
      </CommandDialog>
    );
    expect(screen.getByRole("dialog", { name: "Palette" })).toBeInTheDocument();
  });

  it("ScrollArea and Resizable render", () => {
    render(
      <>
        <ScrollArea data-testid="scroll">
          content
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={50}>left</ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50}>right</ResizablePanel>
        </ResizablePanelGroup>
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel defaultSize={100}>only</ResizablePanel>
          <ResizableHandle />
        </ResizablePanelGroup>
      </>
    );
    expect(screen.getByTestId("scroll")).toHaveTextContent("content");
    expect(screen.getByText("left")).toBeInTheDocument();
    expect(screen.getAllByRole("separator").length).toBeGreaterThan(0);
  });
});
