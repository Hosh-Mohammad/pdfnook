/* pdfnook — tool registry.
 * Single source of truth used by: the homepage search, the tool pages (via build.js),
 * the sitemap and the related-tools lists. Works in the browser (window.TOOLNEST_TOOLS)
 * and in Node (module.exports) so build.js can generate the static pages.
 */
(function (root) {
  var CATEGORIES = [
    { id: 'organize', name: 'Organize PDF' },
    { id: 'compress', name: 'Compress & Optimize' },
    { id: 'to-pdf', name: 'Convert to PDF' },
    { id: 'from-pdf', name: 'Convert from PDF' },
    { id: 'edit', name: 'Edit PDF' },
    { id: 'security', name: 'PDF Security' },
    { id: 'info', name: 'View & Information' }
  ];

  var TOOLS = [
    // ---------- Organize ----------
    {
      id: 'merge-pdf', name: 'Merge PDF', cat: 'organize', icon: '🧩', popular: true,
      short: 'Combine several PDF files into a single document.',
      title: 'Merge PDF Online Free – Combine PDF Files | pdfnook',
      desc: 'Merge PDF online free. Combine multiple PDF files into one document in your browser. No upload, no sign-up, no watermark.',
      lead: 'Combine multiple PDF files into one document, in the order you choose. Everything happens in your browser.',
      accept: '.pdf,application/pdf', multiple: true, kind: 'pdf',
      howto: ['Add two or more PDF files using the upload area.', 'Drag the files (or use the arrows) to set the order.', 'Click “Merge PDF” and download the combined file.'],
      faqs: [
        ['Is merging PDFs really free?', 'Yes. There are no limits on the number of merges and no watermarks are added.'],
        ['Are my files uploaded to a server?', 'No. Files are merged locally in your browser and never leave your device.'],
        ['Can I merge password-protected PDFs?', 'Unlock them first with the Unlock PDF tool, then merge the unlocked copies.']
      ],
      related: ['split-pdf', 'organize-pdf', 'compress-pdf', 'rotate-pdf']
    },
    {
      id: 'split-pdf', name: 'Split PDF', cat: 'organize', icon: '✂️', popular: true,
      short: 'Split a PDF by page ranges, every page, or every N pages.',
      title: 'Split PDF Online – Separate PDF Pages Free | pdfnook',
      desc: 'Split PDF online for free. Separate a PDF into page ranges or single pages and download them as a ZIP. Private, browser-based.',
      lead: 'Split one PDF into several files by page range, into single pages, or into chunks of N pages.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload the PDF you want to split.', 'Choose a split mode: ranges, every page, or every N pages.', 'Click “Split PDF” and download the result (multiple files arrive as a ZIP).'],
      faqs: [
        ['How do I write page ranges?', 'Use commas and dashes, for example 1-3, 5, 8-10. Each range becomes its own PDF.'],
        ['What do I get when I split into many files?', 'A single ZIP archive containing one PDF per range or chunk.'],
        ['Does splitting reduce quality?', 'No. Pages are copied as they are, without recompression.']
      ],
      related: ['extract-pages', 'remove-pages', 'merge-pdf', 'organize-pdf']
    },
    {
      id: 'remove-pages', name: 'Remove PDF Pages', cat: 'organize', icon: '🗑️', popular: false,
      short: 'Delete selected pages from a PDF.',
      title: 'Remove Pages from PDF Online – Delete PDF Pages | pdfnook',
      desc: 'Remove PDF pages online. Click the pages you want to delete and download a clean PDF. Free and processed locally in your browser.',
      lead: 'Click the pages you want to delete, then download the PDF without them.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF and wait for the page previews.', 'Click each page you want to remove (or type page numbers).', 'Click “Remove pages” and download the new PDF.'],
      faqs: [
        ['Can I undo a removal?', 'Your original file is never changed. Reset and start again if you picked the wrong pages.'],
        ['Can I remove all pages?', 'No, at least one page must remain.']
      ],
      related: ['extract-pages', 'split-pdf', 'organize-pdf', 'merge-pdf']
    },
    {
      id: 'extract-pages', name: 'Extract PDF Pages', cat: 'organize', icon: '📤', popular: false,
      short: 'Save selected pages into a new PDF.',
      title: 'Extract Pages from PDF Online Free | pdfnook',
      desc: 'Extract pages from a PDF online. Select the pages you need and save them into a new PDF file. Free, fast and private.',
      lead: 'Pick the pages you need and save them into a new PDF.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Select the pages to keep by clicking the previews or typing a range.', 'Click “Extract pages” and download the new PDF.'],
      faqs: [
        ['Is the page order kept?', 'Yes, extracted pages keep their original order.'],
        ['What is the difference from Split PDF?', 'Extract creates one new PDF from your selection. Split creates several files.']
      ],
      related: ['split-pdf', 'remove-pages', 'organize-pdf', 'merge-pdf']
    },
    {
      id: 'organize-pdf', name: 'Organize PDF', cat: 'organize', icon: '🗂️', popular: false,
      short: 'Reorder PDF pages with drag and drop.',
      title: 'Organize PDF Pages – Reorder with Drag and Drop | pdfnook',
      desc: 'Organize PDF pages online. Drag and drop thumbnails to reorder pages, then download the rearranged PDF. No upload required.',
      lead: 'Drag page thumbnails into the order you want, then save the rearranged PDF.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Drag the page thumbnails to reorder them.', 'Click “Save PDF” and download the result.'],
      faqs: [
        ['Does drag and drop work on phones?', 'Yes, on most modern mobile browsers. You can also use the Move left / Move right buttons that appear on each page.'],
        ['Can I also delete pages here?', 'Use Remove PDF Pages for deleting pages.']
      ],
      related: ['rotate-pdf', 'remove-pages', 'merge-pdf', 'split-pdf']
    },
    {
      id: 'rotate-pdf', name: 'Rotate PDF', cat: 'organize', icon: '🔄', popular: true,
      short: 'Rotate individual pages or the whole document.',
      title: 'Rotate PDF Online – Rotate PDF Pages Permanently | pdfnook',
      desc: 'Rotate PDF online free. Turn single pages or the whole document by 90°, 180° or 270° and save permanently. Browser-based.',
      lead: 'Rotate single pages or the whole document and save the change permanently.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Rotate pages individually, or use “Rotate all”.', 'Click “Save PDF” and download the rotated file.'],
      faqs: [
        ['Is the rotation permanent?', 'Yes. The saved PDF opens with the new orientation in any viewer.'],
        ['Can I rotate only some pages?', 'Yes, use the buttons under each page preview.']
      ],
      related: ['organize-pdf', 'crop-pdf', 'merge-pdf', 'compress-pdf']
    },
    // ---------- Compress ----------
    {
      id: 'compress-pdf', name: 'Compress PDF', cat: 'compress', icon: '🗜️', popular: true,
      short: 'Reduce PDF file size with selectable compression levels.',
      title: 'Compress PDF Online – Reduce PDF Size Free | pdfnook',
      desc: 'Compress PDF online free. Reduce PDF file size with basic or strong compression, processed in your browser with no upload.',
      lead: 'Make your PDF smaller. Choose lossless structural compression, or image-based compression for the biggest savings.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Choose a compression level.', 'Click “Compress PDF”, compare the sizes and download the result.'],
      faqs: [
        ['How does compression work here?', 'Basic mode rewrites the PDF structure without changing content. Strong modes re-render each page as a JPEG image, which can shrink scanned or image-heavy files a lot.'],
        ['What is the downside of strong compression?', 'Pages become images: text can no longer be selected or searched, and links are lost. The tool tells you if the result is not smaller and keeps your original in that case.'],
        ['Why did my file barely shrink?', 'Text-based PDFs are already compact. Image-heavy or scanned PDFs benefit the most.']
      ],
      related: ['optimize-pdf', 'split-pdf', 'merge-pdf', 'pdf-to-jpg']
    },
    {
      id: 'optimize-pdf', name: 'Optimize PDF', cat: 'compress', icon: '⚡', popular: false,
      short: 'Lossless clean-up that can reduce size without changing quality.',
      title: 'Optimize PDF Online – Lossless PDF Optimizer | pdfnook',
      desc: 'Optimize PDF files without losing quality. Pack objects efficiently and optionally remove metadata. Free, private, in-browser.',
      lead: 'Lossless optimization: efficient object packing and optional metadata removal. Your pages are not re-rendered.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Choose whether to strip metadata.', 'Click “Optimize PDF” and download the result.'],
      faqs: [
        ['Will quality change?', 'No. Content is preserved exactly; only the file structure is rewritten.'],
        ['How is this different from Compress PDF?', 'Optimize is lossless and gives modest savings. Compress can shrink image-heavy files much more by recompressing pages.']
      ],
      related: ['compress-pdf', 'pdf-metadata', 'merge-pdf', 'split-pdf']
    },
    // ---------- To PDF ----------
    {
      id: 'jpg-to-pdf', name: 'JPG to PDF', cat: 'to-pdf', icon: '🖼️', popular: true,
      short: 'Convert JPG images into a PDF document.',
      title: 'JPG to PDF Converter – Convert Images to PDF Free | pdfnook',
      desc: 'JPG to PDF converter online. Combine one or more JPG images into a single PDF with page size and margin options. Private and free.',
      lead: 'Turn one or more JPG images into a PDF. Reorder, choose the page size and margins.',
      accept: '.jpg,.jpeg,image/jpeg', multiple: true, kind: 'jpg',
      howto: ['Add one or more JPG images.', 'Order them and pick page size, orientation and margin.', 'Click “Convert to PDF” and download.'],
      faqs: [
        ['Is image quality reduced?', 'No. JPG data is embedded directly without recompression.'],
        ['Can I combine many images?', 'Yes, each image becomes one page, in the order shown.']
      ],
      related: ['png-to-pdf', 'pdf-to-jpg', 'merge-pdf', 'compress-pdf']
    },
    {
      id: 'png-to-pdf', name: 'PNG to PDF', cat: 'to-pdf', icon: '🏞️', popular: false,
      short: 'Convert PNG images into a PDF document.',
      title: 'PNG to PDF Converter Online Free | pdfnook',
      desc: 'Convert PNG to PDF online. Combine PNG images into one PDF with transparency preserved. Free and processed in your browser.',
      lead: 'Convert PNG images to a PDF, keeping transparency. Reorder and choose page size and margins.',
      accept: '.png,image/png', multiple: true, kind: 'png',
      howto: ['Add one or more PNG images.', 'Order them and choose layout options.', 'Click “Convert to PDF” and download.'],
      faqs: [['Is transparency kept?', 'Yes, PNG transparency is preserved in the PDF.']],
      related: ['jpg-to-pdf', 'pdf-to-png', 'merge-pdf', 'compress-pdf']
    },
    {
      id: 'txt-to-pdf', name: 'TXT to PDF', cat: 'to-pdf', icon: '📝', popular: false,
      short: 'Convert plain text files or pasted text into a PDF.',
      title: 'TXT to PDF Converter – Text to PDF Online | pdfnook',
      desc: 'Convert TXT to PDF online. Upload a text file or paste text and get a clean, paginated PDF. Free and private.',
      lead: 'Upload a .txt file or paste your text and get a clean, paginated PDF.',
      accept: '.txt,text/plain', multiple: false, kind: 'txt',
      howto: ['Upload a .txt file or paste text.', 'Choose font, size and page size.', 'Click “Convert to PDF” and download.'],
      faqs: [['Which characters are supported?', 'Standard Latin characters (Western European). Characters outside that set are replaced with “?”.']],
      related: ['html-to-pdf', 'jpg-to-pdf', 'pdf-to-text', 'merge-pdf']
    },
    {
      id: 'html-to-pdf', name: 'HTML to PDF', cat: 'to-pdf', icon: '🌐', popular: false,
      short: 'Convert the text content of HTML into a PDF (no CSS or images).',
      title: 'HTML to PDF Converter (Text Content) Online | pdfnook',
      desc: 'Convert HTML to PDF in your browser. Headings, paragraphs and lists are turned into a PDF. Basic text conversion, no scripts run.',
      lead: 'Basic conversion: headings, paragraphs and lists from your HTML are laid out as a PDF. Styles, images and scripts are not rendered.',
      accept: '.html,.htm,text/html', multiple: false, kind: 'html',
      howto: ['Upload an HTML file or paste HTML.', 'Choose page size and font size.', 'Click “Convert to PDF” and download.'],
      faqs: [
        ['Does it render CSS, images or JavaScript?', 'No. This is a text-based conversion of headings, paragraphs, lists and line breaks. Scripts are never executed.'],
        ['Why not a full renderer?', 'A full HTML renderer needs a server or a large library. This tool stays small, private and works offline.']
      ],
      related: ['txt-to-pdf', 'pdf-to-html', 'jpg-to-pdf', 'merge-pdf']
    },
    // ---------- From PDF ----------
    {
      id: 'pdf-to-jpg', name: 'PDF to JPG', cat: 'from-pdf', icon: '📸', popular: true,
      short: 'Convert every PDF page to a JPG image.',
      title: 'PDF to JPG Converter – Convert PDF Pages to Images | pdfnook',
      desc: 'PDF to JPG converter online. Turn each PDF page into a high-quality JPG image and download as a ZIP. Free and private.',
      lead: 'Convert every page of your PDF to a JPG image. Choose quality and resolution.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Choose image quality and resolution (DPI).', 'Click “Convert to JPG” and download images (ZIP for multiple pages).'],
      faqs: [
        ['What resolution should I choose?', '150 DPI suits screens; 300 DPI suits printing but creates larger files.'],
        ['How do I get the images?', 'A single page downloads as a .jpg; several pages download as a ZIP.']
      ],
      related: ['pdf-to-png', 'jpg-to-pdf', 'compress-pdf', 'extract-pages']
    },
    {
      id: 'pdf-to-png', name: 'PDF to PNG', cat: 'from-pdf', icon: '🎨', popular: false,
      short: 'Convert every PDF page to a lossless PNG image.',
      title: 'PDF to PNG Converter Online Free | pdfnook',
      desc: 'Convert PDF to PNG online. Save each page as a lossless PNG image and download as a ZIP. Browser-based and free.',
      lead: 'Convert every page of your PDF to a lossless PNG image.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Choose the resolution (DPI).', 'Click “Convert to PNG” and download.'],
      faqs: [['PNG or JPG?', 'PNG is lossless and best for text and graphics; JPG gives smaller files for photos.']],
      related: ['pdf-to-jpg', 'png-to-pdf', 'compress-pdf', 'extract-pages']
    },
    {
      id: 'pdf-to-text', name: 'PDF to Text', cat: 'from-pdf', icon: '🔤', popular: false,
      short: 'Extract the text from a PDF into a .txt file.',
      title: 'PDF to Text Converter – Extract Text from PDF | pdfnook',
      desc: 'Extract text from PDF online. Convert a PDF to a plain .txt file in your browser. Free and private; no OCR upload.',
      lead: 'Extract the text layer of a PDF into a plain text file.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Optionally add page separators.', 'Click “Extract text” and download the .txt file.'],
      faqs: [['Does it work on scanned PDFs?', 'No. Scanned PDFs contain images, not text, and this tool does not include OCR.']],
      related: ['pdf-to-html', 'txt-to-pdf', 'pdf-reader', 'pdf-metadata']
    },
    {
      id: 'pdf-to-html', name: 'PDF to HTML', cat: 'from-pdf', icon: '🧾', popular: false,
      short: 'Extract PDF text into a simple HTML page.',
      title: 'PDF to HTML Converter (Text) Online | pdfnook',
      desc: 'Convert PDF to HTML online. Extract text from each page into a clean, simple HTML file. Browser-based; layout is not preserved.',
      lead: 'Extract the text of each page into a simple, clean HTML file. Layout, fonts and images are not preserved.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Click “Convert to HTML”.', 'Download the .html file.'],
      faqs: [['Is the original layout kept?', 'No. You get the text of each page as paragraphs in a simple HTML document.']],
      related: ['pdf-to-text', 'html-to-pdf', 'pdf-reader', 'pdf-metadata']
    },
    // ---------- Edit ----------
    {
      id: 'add-page-numbers', name: 'Add Page Numbers', cat: 'edit', icon: '🔢', popular: false,
      short: 'Add page numbers to a PDF.',
      title: 'Add Page Numbers to PDF Online Free | pdfnook',
      desc: 'Add page numbers to a PDF online. Choose position, format, size and starting number. Free and private in your browser.',
      lead: 'Stamp page numbers on every page. Choose position, format, size and starting number.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Choose position, format and start number.', 'Click “Add page numbers” and download.'],
      faqs: [['Can I skip the first page?', 'Yes. Set the “First page to number” option.']],
      related: ['add-watermark', 'add-text', 'crop-pdf', 'merge-pdf']
    },
    {
      id: 'add-watermark', name: 'Add Watermark', cat: 'edit', icon: '💧', popular: false,
      short: 'Stamp a text watermark on every page.',
      title: 'Add Watermark to PDF Online Free | pdfnook',
      desc: 'Add a text watermark to PDF online. Control text, size, color, opacity and rotation. Free, private and processed in your browser.',
      lead: 'Stamp a text watermark across every page with your own text, color, opacity and angle.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Enter watermark text and style options.', 'Click “Add watermark” and download.'],
      faqs: [['Can the watermark be removed later?', 'The watermark is drawn onto the page content, so keep your original file if you need a clean copy.']],
      related: ['add-text', 'add-page-numbers', 'add-image', 'protect-pdf']
    },
    {
      id: 'add-text', name: 'Add Text to PDF', cat: 'edit', icon: '🅰️', popular: false,
      short: 'Place custom text on a PDF page.',
      title: 'Add Text to PDF Online – Write on PDF Free | pdfnook',
      desc: 'Add text to PDF online. Place text on any page with custom size, color and position. Free and processed in your browser.',
      lead: 'Place text on one page or all pages with custom font, size, color and position.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Type your text and choose page, position, size and color.', 'Click “Add text” and download.'],
      faqs: [['Can I edit existing text?', 'No. This tool adds new text; it does not edit text already in the PDF.']],
      related: ['add-image', 'add-watermark', 'add-page-numbers', 'crop-pdf']
    },
    {
      id: 'add-image', name: 'Add Images to PDF', cat: 'edit', icon: '🖌️', popular: false,
      short: 'Place a JPG or PNG image on a PDF page.',
      title: 'Add Image to PDF Online – Insert Picture in PDF | pdfnook',
      desc: 'Add an image to a PDF online. Place a JPG or PNG logo, signature or picture on any page. Free and private.',
      lead: 'Insert a JPG or PNG (logo, stamp, signature) onto one page or all pages.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Choose the image and set page, position and size.', 'Click “Add image” and download.'],
      faqs: [['Is a transparent PNG supported?', 'Yes, PNG transparency is preserved.']],
      related: ['add-text', 'add-watermark', 'jpg-to-pdf', 'crop-pdf']
    },
    {
      id: 'crop-pdf', name: 'Crop PDF', cat: 'edit', icon: '📐', popular: false,
      short: 'Trim margins from PDF pages.',
      title: 'Crop PDF Pages Online Free | pdfnook',
      desc: 'Crop PDF pages online. Trim margins from the top, bottom, left and right on all or selected pages. Free and private.',
      lead: 'Trim margins from all or selected pages by setting how much to remove from each side.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Enter the margins to remove from each side.', 'Click “Crop PDF” and download.'],
      faqs: [['Is content deleted?', 'Cropping changes the visible area of the page. Content outside it is hidden, not necessarily erased.']],
      related: ['rotate-pdf', 'organize-pdf', 'add-blank-pages', 'compress-pdf']
    },
    {
      id: 'add-blank-pages', name: 'Add Blank Pages', cat: 'edit', icon: '📄', popular: false,
      short: 'Insert blank pages into a PDF.',
      title: 'Add Blank Pages to PDF Online Free | pdfnook',
      desc: 'Insert blank pages into a PDF online. Choose where and how many pages to add. Free and processed in your browser.',
      lead: 'Insert one or more blank pages at the start, end or after a chosen page.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Choose how many blank pages and where to put them.', 'Click “Add blank pages” and download.'],
      faqs: [['What size are the blank pages?', 'By default the size of the neighbouring page. You can also pick a standard size.']],
      related: ['organize-pdf', 'merge-pdf', 'crop-pdf', 'add-page-numbers']
    },
    // ---------- Security ----------
    {
      id: 'protect-pdf', name: 'Protect PDF', cat: 'security', icon: '🔒', popular: true,
      short: 'Encrypt a PDF with a password (AES-256).',
      title: 'Protect PDF with Password Online – Encrypt PDF Free | pdfnook',
      desc: 'Protect PDF with a password online. Add AES-256 encryption in your browser; your file and password never leave your device.',
      lead: 'Add a password to your PDF using AES-256 encryption. Your file and password stay on your device.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf',
      howto: ['Upload your PDF.', 'Enter and confirm a password; choose permissions.', 'Click “Protect PDF” and download the encrypted file.'],
      faqs: [
        ['How strong is the encryption?', 'AES-256 (PDF 2.0, revision 6), supported by current PDF viewers.'],
        ['What if I forget the password?', 'It cannot be recovered. Keep your password somewhere safe.'],
        ['Is my password sent anywhere?', 'No. Encryption runs entirely in your browser.']
      ],
      related: ['unlock-pdf', 'add-watermark', 'compress-pdf', 'pdf-metadata']
    },
    {
      id: 'unlock-pdf', name: 'Unlock PDF', cat: 'security', icon: '🔓', popular: true,
      short: 'Remove a password you know from a PDF.',
      title: 'Unlock PDF Online – Remove PDF Password Free | pdfnook',
      desc: 'Unlock a PDF online. Remove the password from a PDF when you know it. Processed in your browser; nothing is uploaded.',
      lead: 'Remove the password from a PDF — you must enter the correct password. This tool cannot crack unknown passwords.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf-any',
      howto: ['Upload the protected PDF.', 'Enter its password.', 'Click “Unlock PDF” and download the unprotected copy.'],
      faqs: [
        ['Can you unlock a PDF if I forgot the password?', 'No. You need the correct password. This tool does not guess or bypass passwords.'],
        ['Which encryption types work?', 'Standard PDF password encryption (RC4 and AES) as supported by the underlying library. If a file fails to open, it may use an unsupported scheme.']
      ],
      related: ['protect-pdf', 'merge-pdf', 'compress-pdf', 'pdf-reader']
    },
    // ---------- Info ----------
    {
      id: 'pdf-reader', name: 'PDF Reader', cat: 'info', icon: '📖', popular: false,
      short: 'Preview and read PDF files in your browser.',
      title: 'PDF Reader Online – View PDF Files in Browser | pdfnook',
      desc: 'Free online PDF reader. Open and preview PDF files in your browser with zoom and page navigation. No upload, no sign-up.',
      lead: 'Open and read PDF files right in your browser, with page navigation and zoom.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf-any',
      howto: ['Open a PDF using the upload area.', 'Use the page controls and zoom.', 'Close or reset to open another file.'],
      faqs: [['Is my PDF uploaded?', 'No. It is rendered locally with PDF.js.']],
      related: ['pdf-metadata', 'pdf-page-counter', 'pdf-to-text', 'unlock-pdf']
    },
    {
      id: 'pdf-metadata', name: 'PDF Metadata Viewer', cat: 'info', icon: 'ℹ️', popular: false,
      short: 'View a PDF’s title, author, dates, producer and more.',
      title: 'PDF Metadata Viewer – View PDF Properties Online | pdfnook',
      desc: 'View PDF metadata online: title, author, creation date, producer, page size and version. Free and private.',
      lead: 'See a PDF’s document properties: title, author, dates, producer, version and page size.',
      accept: '.pdf,application/pdf', multiple: false, kind: 'pdf-any',
      howto: ['Upload your PDF.', 'View the properties table.', 'Reset to inspect another file.'],
      faqs: [['Can I edit metadata?', 'This tool only displays it. Use Optimize PDF to strip metadata.']],
      related: ['pdf-page-counter', 'pdf-reader', 'optimize-pdf', 'protect-pdf']
    },
    {
      id: 'pdf-page-counter', name: 'PDF Page Counter', cat: 'info', icon: '🔍', popular: false,
      short: 'Count the pages in one or many PDF files.',
      title: 'PDF Page Counter – Count Pages in PDF Online | pdfnook',
      desc: 'Count PDF pages online. Add one or many PDF files and instantly see their page counts and total. Free and private.',
      lead: 'Add one or many PDF files and see each page count, plus a total.',
      accept: '.pdf,application/pdf', multiple: true, kind: 'pdf-any',
      howto: ['Add one or more PDF files.', 'Read the page counts instantly.', 'Reset to count another batch.'],
      faqs: [['Is there a file limit?', 'Only your device’s memory. Very large batches may be slow.']],
      related: ['pdf-metadata', 'pdf-reader', 'split-pdf', 'merge-pdf']
    }
  ];

  var api = { CATEGORIES: CATEGORIES, TOOLS: TOOLS };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { root.TOOLNEST = api; }
})(typeof self !== 'undefined' ? self : this);
