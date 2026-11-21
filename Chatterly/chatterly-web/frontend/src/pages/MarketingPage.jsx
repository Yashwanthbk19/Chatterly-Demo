import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import MarketingLayout from '../components/MarketingLayout';
import { MARKETING_PAGES } from '../constants/marketingPages';

// Sections sit below the fixed 88px header; this keeps a hash target visible.
const SECTION_SCROLL_MARGIN_CLASS = 'scroll-mt-28';

function SectionHeading({ icon, title, description }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#4C6EF5]/10 text-2xl" aria-hidden="true">
        {icon}
      </div>
      <div>
        <h2 className="text-2xl font-bold text-[#212529]">{title}</h2>
        {description ? <p className="mt-1 text-[#71767A]">{description}</p> : null}
      </div>
    </div>
  );
}

function FeatureSection({ section }) {
  return (
    <section id={section.id} className={`${SECTION_SCROLL_MARGIN_CLASS} rounded-[28px] bg-white p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)]`}>
      <SectionHeading icon={section.icon} title={section.title} description={section.description} />

      {section.items?.length ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {section.items.map((item) => (
            <li key={item} className="flex items-start gap-3 text-[#212529]">
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#4C6EF5]/10 text-sm text-[#4C6EF5]" aria-hidden="true">✓</span>
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {section.steps?.length ? (
        <ol className="mt-6 flex flex-col gap-4">
          {section.steps.map((step, index) => (
            <li key={step} className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#4C6EF5] text-sm font-bold text-white" aria-hidden="true">
                {index + 1}
              </span>
              <span className="pt-1 leading-relaxed text-[#212529]">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {section.guides?.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {section.guides.map((guide) => (
            <article key={guide.title} className="rounded-2xl border border-gray-100 bg-[#F8F9FB] p-5">
              <h3 className="font-bold text-[#212529]">{guide.title}</h3>
              <p className="mt-2 leading-relaxed text-[#71767A]">{guide.body}</p>
            </article>
          ))}
        </div>
      ) : null}

      {section.faqs?.length ? (
        <div className="mt-6 divide-y divide-gray-100 rounded-2xl border border-gray-100">
          {section.faqs.map((faq) => (
            <details key={faq.question} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-[#212529] [&::-webkit-details-marker]:hidden">
                {faq.question}
                <span className="text-[#71767A] transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="mt-3 leading-relaxed text-[#71767A]">{faq.answer}</p>
            </details>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function BlogPost({ post }) {
  return (
    <article id={post.id} className={`${SECTION_SCROLL_MARGIN_CLASS} rounded-[28px] bg-white p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)]`}>
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#4C6EF5]">{post.category}</p>
      <h2 className="mt-2 text-2xl font-bold text-[#212529]">{post.title}</h2>
      {post.paragraphs.map((paragraph) => (
        <p key={paragraph} className="mt-4 leading-relaxed text-[#71767A]">{paragraph}</p>
      ))}
    </article>
  );
}

// One of the public pages the home page links to: Features, Platform, Help
// Center or Blog (`page` is the key into MARKETING_PAGES).
export default function MarketingPage({ page }) {
  const content = MARKETING_PAGES[page];
  const location = useLocation();

  useEffect(() => {
    if (!content?.documentTitle) return undefined;
    const previousTitle = document.title;
    document.title = `${content.documentTitle} | Chatterly`;
    return () => {
      document.title = previousTitle;
    };
  }, [content]);

  // The router does not scroll on navigation: start each page at the top, or at
  // the section a link such as "/help#faqs" points to.
  useEffect(() => {
    const targetId = decodeURIComponent(location.hash.replace(/^#/, ''));
    const target = targetId ? document.getElementById(targetId) : null;
    if (target) {
      target.scrollIntoView({ block: 'start' });
      return;
    }
    window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);

  if (!content) return null;

  return (
    <MarketingLayout>
      <main className="px-6 pt-[140px] pb-20 lg:pt-[168px]">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <p className="text-[13px] font-bold uppercase tracking-[0.16em] text-[#4C6EF5]">{content.eyebrow}</p>
            <h1 className="mt-3 text-4xl md:text-5xl font-bold leading-[1.1] tracking-tight text-[#212529]">{content.title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-[#71767A]">{content.intro}</p>
          </div>

          {content.sections?.length ? (
            <>
              <nav className="mt-10 flex flex-wrap gap-2" aria-label={`${content.eyebrow} sections`}>
                {content.sections.map((section) => (
                  <Link
                    key={section.id}
                    to={`#${section.id}`}
                    className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#3F4346] transition-colors hover:border-[#4C6EF5] hover:text-[#4C6EF5]"
                  >
                    {section.title}
                  </Link>
                ))}
              </nav>
              <div className="mt-10 flex flex-col gap-6">
                {content.sections.map((section) => (
                  <FeatureSection key={section.id} section={section} />
                ))}
              </div>
            </>
          ) : null}

          {content.posts?.length ? (
            <div className="mt-12 flex flex-col gap-6">
              {content.posts.map((post) => (
                <BlogPost key={post.id} post={post} />
              ))}
            </div>
          ) : null}

          <div className="mt-16 flex flex-col items-center gap-4 rounded-[28px] bg-white px-8 py-12 text-center shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            <h2 className="text-3xl font-bold text-[#212529]">Ready to start chatting?</h2>
            <p className="max-w-md text-[#71767A]">No need to download anything — start right from your browser.</p>
            <Link
              to="/login"
              className="mt-2 inline-block rounded-2xl bg-[#4C6EF5] px-8 py-4 text-lg font-bold text-white shadow-[0_8px_24px_rgba(76,110,245,0.25)] transition-all hover:-translate-y-1 hover:bg-[#3b5bdb]"
            >
              Get Started
            </Link>
          </div>
        </div>
      </main>
    </MarketingLayout>
  );
}
