# LaTeX Document Generation Skill

Generate professional documents using LaTeX with beautiful formatting, charts, flowcharts, and diagrams.

## Capabilities

- **Whitepapers**: Technical whitepapers with proper structure, citations, and professional styling
- **Reports**: Business and research reports with charts and tables
- **Proposals**: Business proposals with executive summaries and deliverables
- **Guides**: Comprehensive guides with sections, subsections, and examples
- **Research Papers**: Academic papers with proper formatting and references

## Style Templates

Based on professional LaTeX templates used by:
- AXI Mobility (corporate green theme)
- Wispy (tech cyan/magenta theme)

### Color Schemes

1. **Professional** (Default): Blue primary, gray secondary
2. **Wispy**: Cyan primary, magenta accent
3. **Corporate**: Navy blue, green accent
4. **Minimal**: Grayscale, clean

## Document Structure

```
Document
├── Title Page
│   ├── Logo (optional)
│   ├── Title
│   ├── Subtitle
│   ├── Author
│   └── Date
├── Table of Contents (optional)
├── Sections
│   ├── Content Blocks
│   │   ├── Text (with markdown formatting)
│   │   ├── Lists (ordered/unordered)
│   │   ├── Tables
│   │   ├── Info/Warning/Success Boxes
│   │   ├── Code Blocks
│   │   ├── Charts (bar, line, pie)
│   │   ├── Flowcharts
│   │   └── Images
│   └── Subsections
└── References (optional)
```

## Chart Types

- **Bar Charts**: Compare values across categories
- **Line Charts**: Show trends over time
- **Pie/Doughnut**: Show proportions
- **Area Charts**: Cumulative data visualization

## Diagram Types

- **Flowcharts**: Process flows with decisions
- **Architecture Diagrams**: System components
- **Timelines**: Project milestones
- **Org Charts**: Organizational structure

## Usage Examples

### Create a Whitepaper

```
Create a technical whitepaper about autonomous AI agents with:
- Executive summary
- Problem statement
- Technical architecture
- Implementation details
- Market analysis
- Roadmap
```

### Generate Charts

```
Create a bar chart showing quarterly revenue:
- Q1: $1.2M
- Q2: $1.8M
- Q3: $2.4M
- Q4: $3.1M
```

### Create Flowchart

```
Create a flowchart for user authentication:
1. Start → Login Page
2. Login Page → Validate Credentials
3. Validate Credentials → Decision: Valid?
4. Valid? → Yes: Dashboard
5. Valid? → No: Show Error → Login Page
```

## Marathon Mode Integration

For long-form document generation:

1. **Research Phase**: Gather information from web and memory
2. **Outline Phase**: Create document structure
3. **Writing Phase**: Generate content section by section
4. **Review Phase**: Verify facts and formatting
5. **Compilation**: Compile LaTeX to PDF
6. **Delivery**: Send via Telegram with summary

## Tools Used

- `document_create`: Create full documents
- `document_chart`: Generate charts
- `document_flowchart`: Create diagrams
- `document_table`: Generate formatted tables
- `latex_compile`: Compile .tex to .pdf
- `research_report`: Generate research reports
- `send_document_to_telegram`: Deliver to user

## Tips

1. Always provide detailed content for best results
2. Use structured formats (JSON) for complex data
3. Include references for credibility
4. Request fact verification for technical claims
5. Send progress updates during long documents
