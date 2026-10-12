import { FileQuestion, FileText, ShoppingCart, Tags, ClipboardList } from 'lucide-react';

/**
 * The five pipeline documents, mirroring the backend DocConfig. One list page
 * and one detail page serve all of them.
 */
export const DOCS = {
  requirement: {
    kind: 'requirement', route: 'requirements', api: '/requirements', prefix: 'req', icon: FileQuestion,
    label: 'Requirement', plural: 'Requirements', side: 'customer', dateLabel: 'Received',
    statuses: ['open', 'quoted', 'won', 'lost', 'cancelled'],
    subtitle: 'Customer RFQs, the start of every deal.',
    convertLabel: 'Create quote', convertsTo: 'quote',
    extra: [{ key: 'required_by_date', label: 'Required by', type: 'date' }],
  },
  quote: {
    kind: 'quote', route: 'quotes', api: '/quotes', prefix: 'quote', icon: FileText,
    label: 'Quote', plural: 'Quotes', side: 'customer', dateLabel: 'Quote date',
    statuses: ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted', 'cancelled'],
    subtitle: 'Prices offered to customers.',
    convertLabel: 'Convert to sales order', convertsTo: 'sales_order',
    extra: [{ key: 'valid_until', label: 'Valid until', type: 'date' }],
    lineStatus: true,
  },
  sales_order: {
    kind: 'sales_order', route: 'sales-orders', api: '/sales-orders', prefix: 'so', icon: ShoppingCart,
    label: 'Sales order', plural: 'Sales orders', side: 'customer', dateLabel: 'Order date',
    statuses: ['confirmed', 'processing', 'partial', 'shipped', 'delivered', 'cancelled'],
    subtitle: 'Confirmed customer orders: allocate, ship and invoice.',
    extra: [
      { key: 'customer_po_number', label: 'Customer PO', type: 'text' },
      { key: 'required_by_date', label: 'Required by', type: 'date' },
    ],
    fulfilment: true,
  },
  offer: {
    kind: 'offer', route: 'offers', api: '/offers', prefix: 'offer', icon: Tags,
    label: 'Supplier offer', plural: 'Supplier offers', side: 'supplier', dateLabel: 'Offer date',
    statuses: ['draft', 'sent', 'received', 'accepted', 'rejected', 'expired', 'cancelled'],
    subtitle: 'Supplier quotations and RFQs sent to suppliers.',
    convertLabel: 'Create purchase order', convertsTo: 'purchase_order',
    extra: [{ key: 'valid_until', label: 'Valid until', type: 'date' }],
  },
  purchase_order: {
    kind: 'purchase_order', route: 'purchase-orders', api: '/purchase-orders', prefix: 'po', icon: ClipboardList,
    label: 'Purchase order', plural: 'Purchase orders', side: 'supplier', dateLabel: 'Order date',
    statuses: ['draft', 'sent', 'acknowledged', 'partial', 'received', 'cancelled'],
    subtitle: 'Orders placed with suppliers. Receive them into stock.',
    extra: [
      { key: 'supplier_ref_number', label: 'Supplier ref', type: 'text' },
      { key: 'required_by_date', label: 'Required by', type: 'date' },
    ],
    receiving: true,
  },
};

export const docPath = (kind, id) => `/${DOCS[kind].route}/${id}`;
