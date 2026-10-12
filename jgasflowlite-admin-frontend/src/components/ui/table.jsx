import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

function Table({
  className,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "table"
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto" style={{ scrollbarGutter: 'stable' }}>
      <Comp
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props} />
    </div>
  );
}

function TableHeader({
  className,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "thead"
  return (
    <Comp
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props} />
  );
}

function TableBody({
  className,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "tbody"
  return (
    <Comp
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props} />
  );
}

function TableFooter({
  className,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "tfoot"
  return (
    <Comp
      data-slot="table-footer"
      className={cn("bg-muted/50 border-t font-medium [&>tr]:last:border-b-0", className)}
      {...props} />
  );
}

function TableRow({
  className,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "tr"
  return (
    <Comp
      data-slot="table-row"
      className={cn(
        "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        className
      )}
      {...props} />
  );
}

function TableHead({
  className,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "th"
  return (
    <Comp
      data-slot="table-head"
      className={cn(
        "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props} />
  );
}

function TableCell({
  className,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "td"
  return (
    <Comp
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props} />
  );
}

function TableCaption({
  className,
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot : "caption"
  return (
    <Comp
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props} />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
