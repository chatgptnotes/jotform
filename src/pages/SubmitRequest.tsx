import { ExternalLink, FileText, ShoppingCart, Newspaper } from 'lucide-react';

const FORMS = [
  {
    id: '260562405560351',
    title: 'Purchase Order Approval',
    description: 'Submit a purchase or procurement request. Goes through 4-level approval: Department Head → Division Manager → Director → Executive.',
    icon: ShoppingCart,
    color: 'gold',
    url: 'https://eforms.mediaoffice.ae/260562405560351',
    levels: ['Department Head', 'Division Manager', 'Director', 'Executive'],
  },
  {
    id: '260562114142344',
    title: 'Content Publishing Approval Request',
    description: 'Request approval to publish content (press releases, social media, articles). Single-level approval by Content Approver.',
    icon: Newspaper,
    color: 'blue',
    url: 'https://eforms.mediaoffice.ae/260562114142344',
    levels: ['Content Approver'],
  },
];

export default function SubmitRequest() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Submit a New Request</h1>
        <p className="text-gray-400 text-sm">Choose a form below. It will open in JotForm where you can fill and submit your request. Once submitted, it will appear in the approvers' dashboard automatically.</p>
      </div>

      <div className="space-y-4">
        {FORMS.map(form => {
          const Icon = form.icon;
          const isGold = form.color === 'gold';
          return (
            <div
              key={form.id}
              className={`glass-card p-6 border ${isGold ? 'border-gold/20' : 'border-blue-500/20'} rounded-2xl`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isGold ? 'bg-gold/20' : 'bg-blue-500/20'}`}>
                  <Icon className={`w-6 h-6 ${isGold ? 'text-gold' : 'text-blue-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-white mb-1">{form.title}</h2>
                  <p className="text-sm text-gray-400 mb-4">{form.description}</p>

                  <div className="flex flex-wrap gap-2 mb-5">
                    {form.levels.map((level, i) => (
                      <span key={i} className={`px-2.5 py-1 rounded-full text-xs font-medium ${isGold ? 'bg-gold/10 text-gold/80 border border-gold/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                        {i + 1}. {level}
                      </span>
                    ))}
                  </div>

                  <a
                    href={form.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      isGold
                        ? 'bg-gold/20 text-gold hover:bg-gold/30 border border-gold/30'
                        : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    Fill &amp; Submit Form
                    <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 p-4 rounded-xl bg-navy-light/20 border border-navy-light/20">
        <p className="text-xs text-gray-500">
          <span className="text-gray-400 font-medium">What happens after you submit?</span> Your request will appear in the approvers' dashboard within minutes. You can track its progress in the Workflow Tracker page.
        </p>
      </div>
    </div>
  );
}
