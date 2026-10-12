import {
  BarChart3, Boxes, Building, Building2, ClipboardList, Database, FileQuestion, FileText, KeyRound, Link2, LogIn, MapPin, MonitorSmartphone,
  PackageCheck, Receipt, Search, ShieldCheck, ShoppingCart, Sparkles, Tags, Truck, Users, Zap,
} from 'lucide-react';

/**
 * ChipsTrader user manual. Rendered at /help by HelpPage.jsx.
 *
 * KEEP THIS FILE IN STEP WITH THE APP. Whenever a feature is added, changed or
 * removed: update the steps below, add a line at the top of CHANGELOG and bump
 * MANUAL_UPDATED. Quote on-screen labels exactly, in **bold**. Write keys in
 * backticks (`Ctrl`). No em or en dashes.
 *
 * Section shape: { id, group, title, icon, summary, who?, open?: { to, label?, perm? }, tasks: [{ title, steps?, tip?, note? }] }
 */

export const MANUAL_UPDATED = '10 Oct 2026';

export const QUICK_START = [
  { title: 'Set up your company', text: 'Open **Company profile**, fill in your legal details, bank and logo, then click **Save profile**. These appear on every PDF.', section: 'company-profile' },
  { title: 'Check master data', text: 'In **Master data** confirm currencies, exchange rates, payment terms and warehouses.', section: 'master-data' },
  { title: 'Invite your team', text: 'In **Users** click **New user** and pick roles. Each role card shows what that person will be able to do.', section: 'users' },
  { title: 'Add customers and suppliers', text: 'Press `N` and choose **Company**, or open **Customers & suppliers** and click **New company**.', section: 'companies' },
  { title: 'Quote a customer', text: 'Log the RFQ as a **Requirement**, add lines (or import a CSV), then click **Create quote**.', section: 'requirements' },
  { title: 'Buy, receive, ship and invoice', text: 'Create a **Purchase order**, receive the goods, allocate them to the sales order and click **Ship & invoice**.', section: 'fulfilment' },
];

export const SECTIONS = [
  // ───────────── Getting started ─────────────
  {
    id: 'sign-in',
    group: 'Getting started',
    title: 'Signing in and your account',
    icon: LogIn,
    summary: 'Sign in with your username or email. Accounts are created by an administrator; nobody can sign up on their own.',
    tasks: [
      {
        title: 'Sign in',
        steps: ['Open ChipsTrader in your browser.', 'Type your **Username or email** and your **Password**. Click the eye icon to check what you typed.', 'Click **Sign in**.'],
        note: 'After 5 wrong passwords the account is locked for 15 minutes. If you forgot your password, ask an administrator to reset it.',
      },
      {
        title: 'First start on a new installation',
        steps: [
          'When there are no users yet, the app opens **Create the first administrator** by itself.',
          'Fill in **Full name**, **Username**, **Email**, **Password** and **Repeat password**. The checklist turns green when the password is strong enough: 8 or more characters, upper and lower case letters and at least one number.',
          'Click **Create administrator and continue**. You are signed in and taken to **Company profile**.',
        ],
        tip: 'This screen can only be used once. Afterwards, new people are added in **Users**.',
      },
      {
        title: 'Change your password',
        steps: ['Click your initials at the top right.', 'Choose **Change password**.', 'Enter your **Current password**, then the **New password** twice.', 'Click **Change password**.'],
      },
      {
        title: 'Sign out',
        steps: ['Click your initials at the top right.', 'Choose **Sign out**.'],
      },
    ],
  },
  {
    id: 'finding-your-way',
    group: 'Getting started',
    title: 'Finding your way around',
    icon: Zap,
    summary: 'The sidebar lists every screen you have access to. The header has search, the **+ New** menu, the assistant, full screen, the theme switch and this manual.',
    tasks: [
      {
        title: 'Search for anything',
        steps: [
          'Click the search bar at the top, or press `Ctrl` `K` or `/`.',
          'Type a part number, document number, company name or page name.',
          'Use `↑` `↓` to move and `Enter` to open. `Esc` closes the search.',
        ],
        tip: 'When the assistant is enabled, typing a longer question offers **Ask the assistant**.',
      },
      {
        title: 'Create something quickly',
        steps: [
          'Click **+ New** in the header, or press `N`.',
          'Under Create pick **Requirement**, **Quote**, **Sales order**, **Supplier offer**, **Purchase order**, **Company** or **Stock entry**.',
          'Under Work queues jump straight to **Receive goods**, **Ship orders** or **Collect payments**.',
        ],
      },
      {
        title: 'Change how the app looks',
        steps: [
          'Click the moon or sun icon to switch between dark and light mode.',
          'Click the full screen icon or press `F` to use the whole screen. Press `F` or `Esc` to leave.',
          'Click **Collapse** at the bottom of the sidebar to show icons only.',
        ],
      },
      {
        title: 'When a button is missing',
        steps: ['Buttons you have no permission for are hidden, not greyed out.', 'If you need an action you cannot see, ask an administrator to adjust your role.'],
      },
      {
        title: 'Reasons for undoing things',
        steps: ['Cancelling, voiding, reversing or releasing always asks for a **Reason** of at least 3 characters.', 'The reason is saved in the history so everyone can see why it happened.'],
      },
    ],
  },
  {
    id: 'dashboard',
    group: 'Getting started',
    title: 'Dashboard',
    icon: BarChart3,
    summary: "One page with today's numbers, what needs attention, and analytics for the period you choose.",
    who: 'Anyone with dashboard access. Figures are limited to your own customers unless your role sees company-wide figures.',
    open: { to: '/', label: 'Open dashboard', perm: 'dashboard.view' },
    tasks: [
      {
        title: 'Choose the period',
        steps: [
          'At the top right click **Today**, **This month**, **6 months**, **12 months**, **24 months** or **All time**. **All time** is selected when you open the dashboard.',
          'Revenue, gross profit, ratios, customers and parts switch to that period. The ▲ ▼ change compares with yesterday, the same days last month, or the previous period of the same length.',
          '**Revenue and forecast** always shows months of history (12 months for Today and This month, everything for All time), so the trend stays meaningful.',
        ],
        tip: 'Hover a metric card or chart point to see the exact numbers and what they mean.',
      },
      {
        title: 'Headline numbers and ratios',
        steps: [
          'The top tiles show **Revenue**, **Gross profit**, **Open receivables**, **Overdue** and **Stock value**. Click a receivables, overdue or stock tile to open the records behind it.',
          'The row below shows **DSO** (days of sales still unpaid), **Collected**, **Days to pay**, **On time**, **Win rate**, **RFQs quoted**, **Quote to order** and **Repeat buyers**.',
        ],
      },
      {
        title: 'Trend, forecast and findings',
        steps: [
          '**Revenue and forecast** shows monthly revenue, a 3-month average, the trend line and a forecast for the next 3 months. The shaded area is the likely range.',
          'The **R²** badge says how well the trend explains past months. Closer to 1 means a more reliable forecast.',
          '**Key findings** sums up what changed and what to act on.',
        ],
        tip: 'Months ringed in amber were unusual compared with the trend.',
      },
      {
        title: 'Work that needs doing',
        steps: ['**Needs attention** lists overdue orders, old draft quotes, draft invoices and low stock. Click a number to open it.', '**Sales pipeline** shows open value at each stage.'],
      },
      {
        title: 'Customers',
        steps: [
          '**Customer Pareto** ranks customers by revenue. Everyone left of the dashed 80% line is class A. Click a bar to open the customer.',
          '**ABC classes** shows how many customers make up each share of revenue.',
          '**Customer segments** groups customers by how recently and how often they buy, for example Champions, Loyal, At risk.',
          '**Churn risk** lists regular buyers silent for at least twice their usual gap between orders.',
          '**Growing customers** and **Declining customers** compare this period with the one before.',
        ],
      },
      {
        title: 'Products, margin and stock',
        steps: [
          '**Top customers**, **Most profitable parts** and **Sales leaderboard** rank the best performers.',
          '**Invoice sizes** shows how many invoices fall in each value range. **Invoicing activity** is a 26-week calendar; darker squares mean more revenue.',
          '**Gross margin** shows profit as a share of revenue each month.',
          '**Stock age** and **Slow movers** show stock value by age and lots idle for over 90 days. Click a row to open the lot.',
        ],
      },
    ],
  },

  // ───────────── Sales ─────────────
  {
    id: 'documents',
    group: 'Sales',
    title: 'How documents work',
    icon: FileText,
    summary: 'Requirements, quotes, sales orders, supplier offers and purchase orders all use the same screens. Learn them once and you know all five.',
    tasks: [
      {
        title: 'Find a document',
        steps: [
          'Open the list from the sidebar, for example **Quotes**.',
          'Type in the search box: number, title, partner or part number.',
          'Narrow down with the status filter (default **Open statuses**), the customer or supplier filter and the From and To dates. **Clear** resets every filter.',
          'Switch to **All lines** to search part numbers across every line of that document type.',
        ],
      },
      {
        title: 'Create a document',
        steps: [
          'Click the **New** button on the list, for example **New quote**, or press `N`.',
          'Choose the **Customer** or **Supplier**. The **Currency** fills in from the partner.',
          'Optionally add a **Title**, dates, the **Sales rep** or **Buyer** and the **Priority**.',
          'Click **Create**. The new document opens.',
        ],
      },
      {
        title: 'Add lines',
        steps: [
          'Open the **Lines** tab.',
          'For a quick line, type Part number, Manufacturer, Qty and Price in the top row and press `Enter` or click **Add**.',
          'For all details click **Add line**: **Part number (MPN)**, **Quantity**, **Unit price**, date code, package, lead time, RoHS and more. Click **Add line** to save.',
          'Click a line to edit it, or the bin icon to remove it.',
        ],
      },
      {
        title: 'Import lines from a spreadsheet',
        steps: [
          'On the **Lines** tab click **Template** to download the CSV template.',
          'Fill one row per part. Columns: PN, CPN, MFR, DESCRIPTION, DC, PACKAGE, PACKAGING, LIFECYCLE, COO, QTY, TARGET_PRICE, CURRENCY, NEEDED_BY, LEAD_TIME, NOTES.',
          'Click **Import CSV** and choose the file.',
          'Read the **CSV import finished** summary. It shows how many lines were imported and lists any skipped rows. Click **Done**.',
        ],
        tip: 'Manufacturers, packages or countries that are not in master data are kept in the line notes so nothing is lost.',
      },
      {
        title: 'Terms, totals, files and history',
        steps: [
          '**Terms & totals**: set payment terms, Incoterm, addresses, shipping and other costs and tax, then click **Save terms**.',
          '**Files**: click **Upload** or drag files onto the tab.',
          '**History**: see every change, who made it and when.',
          'Click **Edit** on the summary card to change the title, contact, dates, notes printed on the PDF and internal notes.',
        ],
      },
      {
        title: 'Status, PDF and cancelling',
        steps: [
          'Click **PDF** to open the printable document in a new tab.',
          'Use **Status** to change the status by hand, for example mark a quote as **Sent**.',
          'Under **More** choose **Cancel**, enter a reason and confirm with **Cancel document**. **Restore** brings it back.',
        ],
        note: 'Some statuses are set automatically and cannot be picked by hand: a sales order becomes **Partial** or **Shipped** from shipments, and a purchase order becomes **Partial** or **Received** from receiving.',
      },
    ],
  },
  {
    id: 'requirements',
    group: 'Sales',
    title: 'Requirements (customer RFQs)',
    icon: FileQuestion,
    summary: 'A requirement records what a customer asked for. It is the start of every sale.',
    open: { to: '/requirements', perm: 'req.view' },
    tasks: [
      {
        title: 'Log a customer request',
        steps: [
          'Click **New requirement** (or press `N` and choose **Requirement**).',
          'Choose the **Customer**, the **Source** (Email, Phone, Portal, Show or Other) and **Required by** if known.',
          'Click **Create requirement**, then add the requested parts on the **Lines** tab, or import the customer\'s list with **Import CSV**.',
        ],
      },
      {
        title: 'Turn it into a quote',
        steps: ['Open the requirement.', 'Click **Create quote**. The quote opens with every line copied, and the requirement becomes **Quoted**.', 'Set **Won** or **Lost** with **Status** when the customer decides.'],
        tip: 'Clicking **Create quote** again simply opens the quote that already exists.',
      },
    ],
  },
  {
    id: 'quotes',
    group: 'Sales',
    title: 'Quotes',
    icon: FileText,
    summary: 'Prices you offer a customer. Statuses: Draft, Sent, Accepted, Rejected, Expired, Converted, Cancelled.',
    open: { to: '/quotes', perm: 'quote.view' },
    tasks: [
      {
        title: 'Send a quote',
        steps: ['Check prices on the **Lines** tab and terms on **Terms & totals**.', 'Click **PDF** and send the file to your customer.', 'Click **Status** and choose **Sent**.'],
      },
      {
        title: 'Convert to a sales order',
        steps: ['When the customer orders, open the quote.', 'Click **Convert to sales order**.', 'The sales order opens and the quote becomes **Converted**.'],
        tip: 'On the dashboard the win rate counts Converted and Accepted quotes against all decided quotes.',
      },
    ],
  },
  {
    id: 'sales-orders',
    group: 'Sales',
    title: 'Sales orders',
    icon: ShoppingCart,
    summary: 'A confirmed customer order. It opens on the **Fulfilment** tab, where you allocate stock, ship and invoice.',
    open: { to: '/sales-orders', perm: 'so.view' },
    tasks: [
      {
        title: 'Create a sales order',
        steps: ['Usually it comes from a quote with **Convert to sales order**.', 'To start from scratch click **New sales order**, choose the customer and enter the **Customer PO**.', 'Add lines, then go to the **Fulfilment** tab.'],
      },
    ],
  },
  {
    id: 'fulfilment',
    group: 'Sales',
    title: 'Fulfilment: allocate, ship and invoice',
    icon: Link2,
    summary: 'Reserve stock lots for each order line, ship them, and ChipsTrader creates the invoice for you.',
    who: 'Allocating needs allocation rights; shipping needs shipment rights.',
    tasks: [
      {
        title: 'Allocate stock to an order line',
        steps: [
          'Open the sales order. The **Fulfilment** tab opens first.',
          'In **Order lines** click **Allocate** on a line.',
          'Click **Auto-fill (FIFO)** to take the oldest lots first, or type quantities in the **Allocate** column yourself.',
          'To offer an alternative part, type it in the search box and click **Search**.',
          'Click **Allocate**.',
        ],
      },
      {
        title: 'Release an allocation',
        steps: ['In the **Allocations** card click **Release** on the line.', 'Enter a reason and confirm with **Release**. The stock is free again.'],
      },
      {
        title: 'Ship and invoice',
        steps: [
          'Click **Ship & invoice** in the **Order lines** card.',
          'Fill in **Ship date**, **Carrier**, **Tracking number**, **Ship to** and **Incoterm**.',
          'Check the **Ship now** quantity for each lot. You can ship part of the order.',
          'Click **Ship & create invoice**. A draft invoice opens, ready to issue.',
        ],
        tip: 'The order status changes to **Partial** or **Shipped** automatically.',
      },
      {
        title: 'Share tracking with the customer',
        steps: [
          'In the **Customer tracking** card click **Copy link** and send it to the customer.',
          'Click **Milestone** to add progress such as Order confirmed, Shipped or Arrived. The **Note** is visible to the customer.',
        ],
        tip: 'The tracking page shows progress and shipments but never prices.',
      },
    ],
  },
  {
    id: 'invoices',
    group: 'Sales',
    title: 'Invoices and payments',
    icon: Receipt,
    summary: 'Invoices are created by shipping. Issue them, record payments and follow up overdue ones. Flow: Draft, Issued, Paid.',
    open: { to: '/invoices', perm: 'inv.view' },
    tasks: [
      {
        title: 'Issue an invoice',
        steps: ['Open the draft invoice.', 'Click **Edit** to check the invoice date, due date, extra costs, tax and notes, then **Save**.', 'Click **Issue invoice**.', 'Use **Print** and choose **Invoice**, **Delivery note** or **Packing slip**.'],
      },
      {
        title: 'Record a payment',
        steps: ['Open the invoice and click **Record payment**.', 'Enter the **Amount**, **Date**, **Method** and a **Reference**.', 'Save. When fully paid, the invoice becomes **Paid**.'],
        tip: 'Recorded the wrong amount? Click the reverse icon on that payment and confirm **Reverse payment**.',
      },
      {
        title: 'Follow up unpaid invoices',
        steps: ['On the invoice list click **Unpaid** or **Overdue**, or click **Collect payments** in the **+ New** menu.', 'An issued invoice past its due date shows an **Overdue** badge.'],
      },
      {
        title: 'Void an invoice',
        steps: ['Click **Void**, enter a reason and confirm **Void invoice**.'],
        note: 'Voiding also cancels the shipment and puts the stock back.',
      },
    ],
  },

  // ───────────── Purchasing ─────────────
  {
    id: 'offers',
    group: 'Purchasing',
    title: 'Supplier offers',
    icon: Tags,
    summary: 'Prices a supplier offers you. Accept one by turning it into a purchase order.',
    open: { to: '/offers', perm: 'offer.view' },
    tasks: [
      {
        title: 'Record an offer and order from it',
        steps: ['Click **New supplier offer** and choose the **Supplier**.', 'Add the offered parts and prices on the **Lines** tab, or use **Import CSV**.', 'To buy, click **Create purchase order**. The offer becomes **Accepted**.'],
      },
    ],
  },
  {
    id: 'purchase-orders',
    group: 'Purchasing',
    title: 'Purchase orders',
    icon: ClipboardList,
    summary: 'What you order from suppliers. Statuses: Draft, Sent, Acknowledged, Partial, Received, Cancelled.',
    open: { to: '/purchase-orders', perm: 'po.view' },
    tasks: [
      {
        title: 'Place a purchase order',
        steps: ['Click **New purchase order**, or **Create purchase order** on a supplier offer.', 'Check lines and **Terms & totals**.', 'Click **PDF** and send it to the supplier.', 'Click **Status** and choose **Sent**. Receiving is only possible after this.'],
      },
    ],
  },
  {
    id: 'sourcing',
    group: 'Purchasing',
    title: 'Part sourcing',
    icon: Search,
    summary: 'Look up one part number everywhere at once: stock, requirements, quotes, offers and orders.',
    open: { to: '/sourcing', perm: ['req.view', 'quote.view', 'po.view', 'stock.view'] },
    tasks: [
      {
        title: 'Check a part',
        steps: ['Open **Part sourcing**.', 'Type a part number, for example LM358, and click **Search**.', 'The **In stock** card shows available lots; other cards show where the part appears in documents.'],
      },
    ],
  },

  // ───────────── CRM ─────────────
  {
    id: 'companies',
    group: 'CRM',
    title: 'Customers and suppliers',
    icon: Building2,
    summary: 'One list for every company you trade with. A company can be a customer, a supplier, or both.',
    open: { to: '/companies', perm: ['company.view', 'customer.view', 'supplier.view'] },
    tasks: [
      {
        title: 'Add a company',
        steps: ['Click **New company**.', 'Enter the **Legal name**, country, VAT id and contact details.', 'Tick **Customer**, **Supplier** or both, and choose the **Account holder**.', 'Click **Create company**.'],
      },
      {
        title: 'Terms, addresses and contacts',
        steps: [
          'Open the company and use the tabs.',
          '**Customer terms**: credit limit, payment terms, discount and sales rep.',
          '**Supplier terms**: lead time, Incoterm, purchase currency, rating and bank details.',
          '**Addresses**: click **Add address**, choose billing, shipping or both, and tick **Default address for this type**.',
          '**Contacts**: click **Add contact** and tick **Primary contact** for the main person.',
        ],
      },
      {
        title: 'Start a deal from the company',
        steps: ['Click **+ Requirement** on a customer or **+ Offer** on a supplier.', 'The **Documents** tab lists every document for this company.'],
      },
    ],
  },

  // ───────────── Warehouse ─────────────
  {
    id: 'receiving',
    group: 'Warehouse',
    title: 'Receiving goods',
    icon: PackageCheck,
    summary: 'Book goods that arrive against a purchase order. Each received line becomes a stock lot.',
    open: { to: '/receipts', label: 'Open receivings', perm: 'recv.view' },
    tasks: [
      {
        title: 'Receive against a purchase order',
        steps: [
          'Click **Receive goods** in the **+ New** menu, or open the purchase order and go to the **Receiving** tab.',
          'Click **Receive goods**.',
          'Set **Received on**, **Warehouse** and the **Supplier packing no.**',
          'For each line enter the quantity in **Receive**, plus **Date code**, **Batch / lot** and **Bin**.',
          'Click **Post receipt**. The PO becomes **Partial** or **Received**.',
        ],
        note: 'A receipt can only be cancelled while none of its stock has been allocated or shipped.',
      },
    ],
  },
  {
    id: 'stock',
    group: 'Warehouse',
    title: 'Stock',
    icon: Boxes,
    summary: 'Every lot on hand with its cost, date code and location. Lots move from received to allocated to shipped.',
    open: { to: '/stock', perm: 'stock.view' },
    tasks: [
      {
        title: 'Find stock',
        steps: ['Type a part number and narrow by manufacturer, warehouse or status.', 'Tick **Available only** to hide what is already reserved.', 'Click a lot to see its allocations, shipments, **Audit trail** and files.'],
      },
      {
        title: 'Add stock without a purchase order',
        steps: ['Click **Add stock** (or **Stock entry** in the **+ New** menu).', 'Enter **Part number**, **Quantity**, **Unit cost** and location details.', 'Save.'],
      },
      {
        title: 'Correct a lot',
        steps: ['Open the lot and click **Edit lot**.', 'Change date code, status, warehouse, bin, cost or the counted quantity.', 'Changing cost or quantity asks for a **Reason for cost / quantity change**.'],
      },
    ],
  },
  {
    id: 'shipments',
    group: 'Warehouse',
    title: 'Allocations and shipments',
    icon: Truck,
    summary: 'See all reservations and all shipments in one place. Shipments are created from the sales order.',
    open: { to: '/shipments', label: 'Open shipments', perm: 'shipment.view' },
    tasks: [
      {
        title: 'Work with a shipment',
        steps: [
          'Open **Shipments** and click a shipment.',
          'Use **Print** for the **Delivery note** or **Packing slip**.',
          'Click **Edit** to update carrier or tracking number.',
          'Click **Mark delivered** once the customer has the goods.',
        ],
        note: '**Cancel** on a shipment voids its invoice and puts the stock back.',
      },
      {
        title: 'Check allocations',
        steps: ['Open **Allocations** to see every active reservation.', 'Click a row to jump to the sales order\'s **Fulfilment** tab.'],
      },
    ],
  },

  // ───────────── Administration ─────────────
  {
    id: 'users',
    group: 'Administration',
    title: 'Users',
    icon: Users,
    summary: 'Add people, give them roles and manage their access. Accounts are stored only in the database.',
    who: 'Administrators with user management rights.',
    open: { to: '/admin/users', perm: 'sys.users.manage' },
    tasks: [
      {
        title: 'Add a user',
        steps: [
          'Click **New user**.',
          'Under **Account** enter full name, username, email and a starting password.',
          'Under **Roles & access** click one or more role cards. The **What they can do** panel shows exactly what the person will be able to see and change.',
          'Click **Create user** and give the person their password privately. They can change it themselves.',
        ],
      },
      {
        title: 'Change, disable or reset',
        steps: [
          'Click the **•••** menu on the user row.',
          '**Edit** changes details and roles. Set **Status** to Disabled to block sign-in.',
          '**Reset password** sets a new password.',
          '**Sign out everywhere** ends all their sessions at once.',
        ],
        note: 'Only a super admin can change another super admin, and the last super admin cannot be removed.',
      },
    ],
  },
  {
    id: 'roles',
    group: 'Administration',
    title: 'Roles and permissions',
    icon: ShieldCheck,
    summary: 'A role is a set of access rights. Give each module a level (No access, View, Edit, Full) and a record scope (Own records, Their accounts, All records).',
    open: { to: '/admin/roles', perm: 'sys.roles.manage' },
    tasks: [
      {
        title: 'Create a role',
        steps: ['Click **New role**, enter the **Role name** and a **Description**, then **Create role**.', 'Or select a role, open **More** and choose **Duplicate role** to start from a copy.'],
      },
      {
        title: 'Set module access',
        steps: [
          'Select the role and open **Module access**.',
          'For each module click **No access**, **View**, **Edit** or **Full**.',
          'Choose the record scope: **Own records**, **Their accounts** or **All records**.',
          'Use the presets **View everything**, **Full business access** or **No access** to start quickly.',
          'Click **Save role** in the bar at the bottom, or **Discard** to undo.',
        ],
        tip: 'A **Custom** badge means the module has individual permissions set on the **Advanced** tab.',
      },
      {
        title: 'Add people to a role',
        steps: ['Open the **Users** tab of the role.', 'Pick a person in **Choose a user to add…** and click **Add to role**.', 'Click **Remove** to take someone out.'],
      },
      {
        title: 'Delete a role',
        steps: ['Open **More** and choose **Delete role**.'],
        note: 'Built-in roles and roles that still have members cannot be deleted.',
      },
    ],
  },
  {
    id: 'sessions',
    group: 'Administration',
    title: 'Active sessions',
    icon: MonitorSmartphone,
    summary: 'Everyone signed in right now, with device and IP. End a session to sign that device out.',
    open: { to: '/admin/sessions', perm: 'sys.sessions.manage' },
    tasks: [{ title: 'Sign a device out', steps: ['Open **Active sessions**.', 'Click **End** on the session.'] }],
  },
  {
    id: 'master-data',
    group: 'Administration',
    title: 'Master data',
    icon: Database,
    summary: 'The lists used everywhere: currencies, payment terms, Incoterms, manufacturers, warehouses, countries and more.',
    open: { to: '/admin/master-data', perm: 'master.view' },
    tasks: [
      {
        title: 'Edit a list',
        steps: ['Choose a list on the left. The selected list is highlighted in cyan.', 'Click **Add** for a new entry, or the pencil icon to edit one.', 'Click the archive icon to retire an entry. It leaves the **Active** tab and stops appearing in dropdowns, but old documents keep it.', 'Open the **Archived** tab to see retired entries and click **Restore** to bring one back.'],
      },
      {
        title: 'Update exchange rates',
        steps: ['Open **Currencies** and click **Exchange rates**.', 'Enter how much of each currency equals 1 of the main currency.', 'Click **Save rates**. Reports and analytics convert with these rates.'],
      },
    ],
  },
  {
    id: 'company-profile',
    group: 'Administration',
    title: 'Company profile',
    icon: Building,
    summary: 'Your own company details, bank, logo and PDF styling. They appear on every quote, order and invoice.',
    open: { to: '/admin/company', perm: 'sys.settings.manage' },
    tasks: [
      {
        title: 'Set up your details and PDF look',
        steps: ['Fill in **Company** and **Legal & bank**.', 'Click **Upload logo**.', 'Adjust colours and margins under **PDF styling** and check the **PDF preview**.', 'Click **Save profile**.'],
      },
    ],
  },
  {
    id: 'assistant',
    group: 'Administration',
    title: 'Crew Console (AI assistant)',
    icon: Sparkles,
    summary: 'A crew of six AI agents that answer from live ChipsTrader data: **Nova** (Command), **Vega** (Sales), **Orion** (Procurement), **Atlas** (Warehouse), **Lyra** (Finance) and **Sigma** (Analytics). They share one conversation, so context carries over when they switch. Answers are read-only.',
    who: 'Users whose role includes the assistant. Setup needs AI settings rights.',
    open: { to: '/admin/ai', label: 'Open AI settings', perm: 'ai.settings.manage' },
    tasks: [
      {
        title: 'Talk to the crew (live voice)',
        steps: [
          'Click **Assistant** or press `Ctrl` `J`. When live voice is switched on, the console opens in **Voice** mode. Click **Start conversation** and allow the microphone the first time your browser asks.',
          'Just speak. The reactor in the middle shows what is happening: **Listening**, **Thinking**, **Looking it up** while it reads the data, and **Speaking** while the agent answers. Your words and the answer appear as text above it.',
          'While the agent talks, the data it looked up opens in pop-up windows on the right: tables for lists (for example overdue invoices), figures for a record or a part. Amounts show their currency, quantities have thousands separators, dates are written out. Click a window title to open or fold it, the cross to close it, or **Close all**.',
          'Interrupt at any time by talking; the agent stops and listens.',
          'To talk to another agent, click it in the **Crew** list or say "let me talk to Lyra". The new agent continues with everything said so far.',
          'Use the microphone button to mute, the keyboard button to type a message during the conversation, and **End conversation** to finish. **Start conversation** begins a new one; **Type instead** or the **Text** switch at the top returns to typed chat.',
        ],
        tip: 'Each agent has its own voice and colour, so you always hear and see who is talking.',
        note: 'Live voice must be switched on by an administrator: **Administration**, **AI assistant**, **Enable live voice**. If it is off, the console opens in text mode.',
      },
      {
        title: 'Ask the crew',
        steps: [
          'Click **Assistant** in the header or press `Ctrl` `J` to open the Crew Console.',
          'Type your question and press `Enter`. `Shift` `Enter` adds a new line. Or click one of the suggestions.',
          'With **Auto routing** on, the best agent takes the question: a stock question goes to Atlas, an overdue invoice to Lyra, a forecast to Sigma.',
          'Watch the crew work: each step appears with a spinner, then a tick and its time. The **Telemetry** panel shows which agent is active.',
          'Document numbers in an answer (for example SO-2026-0001) are links. Click one to open that record.',
        ],
        tip: 'Short follow-ups such as "and its tracking?" stay with the agent already answering.',
      },
      {
        title: 'What you can ask',
        steps: [
          'Anything ChipsTrader records: documents and their lines, invoices and payments, stock lots, shipments, receipts, allocations, customers, suppliers, contacts and document history.',
          'Lists and lookups: "open SO-2026-0001", "quotes still open for Acme", "who cancelled SHP-2026-0004 and why".',
          'Totals and rankings: "revenue by customer this year", "top 10 parts by gross profit", "stock value by warehouse".',
          'Comparisons and periods: "PO spend by supplier per quarter", "payments in the last 30 days by method".',
          'Follow-ups work: after asking about a part or an order, "and its date codes?" or "who is the customer?" refer back to it.',
        ],
      },
      {
        title: 'Go deep: parts, companies and record chains',
        steps: [
          '**A part number**: ask "tell me everything about LM358DR". You get who asked for it, quotes, orders, supplier offers, who we bought it from (quantity and spend), the stock lots, who bought it (quantity, revenue, margin) and average buy vs sell price.',
          '**A customer or supplier**: ask "full picture of Acme". You get what they bought or supplied, top parts, open and overdue invoices, how fast they pay, quotes and open orders.',
          '**Up the chain** (origin): "where did the goods on INV-2026-0001 come from?" follows invoice, shipment, order, quote, RFQ and the stock lot, receipt, purchase order and supplier.',
          '**Down the chain** (results): "what happened to PO-2026-0001?" follows receipts, stock lots, allocations, shipments, invoices and payments, so you see which customers got that stock.',
          'Keep drilling: ask about any number in the answer, for example "open STK-2026-0002" or "who else bought from that lot?".',
        ],
        tip: 'Answers only include records your role can open. Cost and profit figures need the dashboard cost permission.',
      },
      {
        title: 'Choose or address an agent',
        steps: [
          'Click an agent in the **Crew** list to pin it: every question goes to that agent until you click it again or click **Auto routing**.',
          'Or start a message with `@` and pick an agent, for example **@Lyra who owes us?**.',
          'You can also write "Ask Orion where to source LM358DR".',
        ],
      },
      {
        title: 'How agents work together',
        steps: [
          '**Handoff**: if a question belongs to another agent, it is handed over automatically. A ribbon such as **VEGA → ATLAS** shows who passed it and why.',
          '**Consult**: an agent can ask a colleague for one fact and use the answer. A card such as **ATLAS asks LYRA** shows the question; click it to read the colleague\'s reply.',
          'Under each answer, click **steps** to see every lookup the crew made.',
        ],
      },
      {
        title: 'Conversations',
        steps: ['Click **History** to reopen an earlier conversation; each answer keeps its agent, handoffs and consults.', 'Click **New** to start fresh.', 'Click the bin icon on a conversation to delete it.'],
        note: 'Clicking stop ends the live view only. The crew finishes in the background and the answer is saved to the conversation.',
      },
      {
        title: 'Connect the assistant (administrators)',
        steps: ['Open **AI assistant** under Administration.', 'Paste the **API key**, choose the **Model** and click **Test connection**.', 'Optionally turn on **Enable voice mode** or **Enable live voice**.', 'Click **Save**.'],
      },
    ],
  },
  {
    id: 'tracking',
    group: 'Administration',
    title: 'Customer tracking page',
    icon: MapPin,
    summary: 'A public page for one order, opened with the link from the sales order. Customers see progress and shipments, never prices.',
    tasks: [
      {
        title: 'What the customer sees',
        steps: ['The order number, order date and their PO.', 'The **Progress** list of milestones you added.', '**Shipments** with carrier and tracking number.', 'The page refreshes by itself every minute.'],
      },
    ],
  },
  {
    id: 'password-recovery',
    group: 'Administration',
    title: 'Locked out administrator',
    icon: KeyRound,
    summary: 'If no administrator can sign in, the server owner can reset a password from the backend folder.',
    tasks: [
      {
        title: 'Reset a password on the server',
        steps: [
          'Open a terminal in the **chipstrader-backend** folder.',
          'Run `npm run user:reset-password` and follow the prompts. Add `-- --super-admin` to also make that user an active super admin.',
          'The tool signs that user out everywhere. Sign in with the new password.',
        ],
      },
    ],
  },
];

export const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], text: 'Search and jump anywhere' },
  { keys: ['/'], text: 'Search' },
  { keys: ['N'], text: 'Open the + New menu' },
  { keys: ['Ctrl', 'J'], text: 'Open the Crew Console' },
  { keys: ['@'], text: 'Address an agent (in the console)' },
  { keys: ['F'], text: 'Full screen on or off' },
  { keys: ['?'], text: 'Open this manual' },
  { keys: ['Enter'], text: 'Add a quick line on the Lines tab' },
  { keys: ['Esc'], text: 'Close a dialog, menu or search' },
];

export const FAQ = [
  { q: 'I cannot see a menu item or button that a colleague has.', a: 'Screens and buttons appear only when your role allows them. Ask an administrator to check your role in **Roles & permissions**.' },
  { q: 'Why can I not receive goods on my purchase order?', a: 'The purchase order must be marked **Sent** first. Open it, click **Status** and choose **Sent**.' },
  { q: 'Why can I not pick Shipped as a sales order status?', a: 'Partial and Shipped follow the shipped quantities automatically. Ship with **Ship & invoice** on the **Fulfilment** tab.' },
  { q: 'How do I undo a shipment?', a: 'Open the shipment and click **Cancel**, or void its invoice. Both put the stock back and cancel the other.' },
  { q: 'A receipt cannot be cancelled.', a: 'Some of its stock is already allocated or shipped. Release the allocation or cancel the shipment first.' },
  { q: 'The analytics look empty or say the forecast is a rough guide.', a: 'Forecasts need at least six months with sales. Until then the numbers are shown, but the forecast range is wide.' },
  { q: 'Amounts are in different currencies. How are totals calculated?', a: 'Dashboard and analytics totals are converted to the main currency with the rates in **Master data**, **Currencies**, **Exchange rates**.' },
  { q: 'I am locked out after wrong passwords.', a: 'Wait 15 minutes, or ask an administrator to use **Reset password** on your user.' },
  { q: 'Full screen does not work.', a: 'Some embedded browsers block it. Open ChipsTrader in Chrome or Edge and press `F`.' },
];

export const CHANGELOG = [
  {
    date: '10 Oct 2026',
    items: [
      { type: 'improved', text: 'Voice conversations start with **Start conversation** (never automatically), show the data the agent looked up in pop-up windows, and format every figure by type: amounts with currency, quantities, percentages and dates.' },
      { type: 'new', text: 'Live voice in the Crew Console: it opens straight into a spoken conversation (Gemini Live), each agent with its own voice, handing the call over to a colleague with the conversation so far.' },
      { type: 'new', text: 'Deep dives in the Crew Console: a complete dossier for any part number or company, and record chains traced up to their origin or down to their results (invoice to supplier, purchase order to customers).' },
      { type: 'improved', text: 'The crew can now answer any question about recorded data: a universal data query (lists, totals, rankings, periods), opening any record by number with its history, reference data, the team directory, and memory of the records a conversation is about.' },
      { type: 'new', text: '**Crew Console**: six AI agents (Nova, Vega, Orion, Atlas, Lyra, Sigma) with automatic routing, handoffs, colleague consults, live step-by-step progress and a crew network view. Open it with `Ctrl` `J`.' },
      { type: 'improved', text: '**Master data** has **Active** and **Archived** tabs with counts, distinct archive and restore actions, and a cyan highlight for the selected list.' },
      { type: 'new', text: 'Dashboard periods **Today**, **This month** and **All time**, next to 6, 12 and 24 months.' },
      { type: 'improved', text: 'The dashboard is now one page: overview and analytics together, with a period switch at the top and labels that never wrap.' },
      { type: 'improved', text: 'Cleaner screens: descriptions under titles were removed, and field hints now sit behind a small info icon next to the label. Hover it to read the hint.' },
      { type: 'new', text: 'Dashboard analytics: forecast with likely range, key findings, Pareto and ABC classes, RFM segments, churn risk, cash health ratios, invoice size distribution, activity calendar, margin trend, profitable parts and slow-moving stock.' },
      { type: 'new', text: 'This **User manual**, with search, quick start, shortcuts and questions. Open it from the sidebar, the help icon in the header or with `?`.' },
      { type: 'improved', text: '**New user** dialog shows role cards next to a **What they can do** summary.' },
      { type: 'improved', text: '**Roles & permissions** now set access per module with levels and record scopes, plus presets.' },
      { type: 'new', text: 'First administrator is created on a setup screen; no accounts are stored in configuration files.' },
      { type: 'new', text: 'Full screen button (`F`), **+ New** quick actions menu (`N`) and show/hide eye on password fields.' },
    ],
  },
];

