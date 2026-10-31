# To look into later

Things raised while switching Production Order and Production Assignment to plain React screens (Oct 2026) and set
aside on purpose. Each says what is open and what was found. Take one up by moving it into a plan; strike it here when
done.

## Production Order

### Order creation time (left for now, owner 31 Oct 2026)
Only the date is stored: `PRODHeader.OrderDate`. The time an order was created is kept nowhere (the original writes
the EventLog only when a save fails). Options weighed:
1. A `CreatedOn` column: `ALTER TABLE PRODHeader ADD CreatedOn datetime NULL DEFAULT GETDATE();` on TEST, then LIVE.
   Cleanest; a schema change, so it needs the owner's approval (MIGRATION-PLAN.md); only new orders get a time.
2. Log each successful create in the EventLog (it has EventDate / EventTime) and show the time from there. No schema
   change; forms-write parity then sees an extra EventLog row (an intended difference).
3. The time inside `OrderDate`: not advised, reports that match orders by date would stop finding them.

The print time is stored already: `MaterialBarcode.CreatedOn` (the Serial numbers list shows it as "Printed on").

### Closing an order (open)
A saved order cannot be changed or cancelled (owner's rule), so nobody can set its status to Closed from the screen.
Decide how an order gets Closed: automatically when everything is printed / produced, from another screen, or a
dedicated Close action with its own rule.

## Production Assignment

### Fully printed old orders still in the order list (open)
The order list is `openOrders`: orders with `Qty > isnull(AssignedQty, 0)`. `AssignedQty` is only counted since
21 Oct 2026, so an order printed in full before that can still be listed, while its progress line ("Printed 10 of 10")
counts the real job cards (`ProcessOrder`). Option: list orders by their job-card count instead, so the list and the
progress always agree (the page handler's list changes: an intended difference for events parity).

## All screens

- The other screens still run on the copied form engine (`/api/forms`); switch them one at a time as Production
  Order and Production Assignment were (CLIENT-SWITCH-PLAN.md). Suggested next: WIP Capture.
- The client has no tests and no lint / Prettier setup.
