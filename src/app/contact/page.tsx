export default function ContactPage() {
  return (
    <main className="max-w-3xl px-5 sm:px-8 py-9">
      <h1 className="text-4xl font-semibold text-[#0b1d33]">Get in Touch</h1>
      <p className="mt-5 text-neutral-700 leading-relaxed">
        See something that&apos;s off or want to partner on the next big thing?
        Email the Observatory at:
      </p>
      <a
        href="mailto:support@av-observatory.com"
        className="inline-block mt-4 text-lg font-semibold text-[#184f95] underline underline-offset-2"
      >
        support@av-observatory.com
      </a>
    </main>
  );
}
