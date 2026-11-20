import { Finish, FirstCompany, StepBar, STEPS, WaitForLink } from "./setup-steps";

const DESC = [
  "اختار إزاي الداشبورد هيوصل لشيتات Google، ووصّله، واختبره.",
  "الصق لينك شيت الشركة (نسخة من الـ Master). هنفحص إن كل التابات والأعمدة موجودة.",
  "الداشبورد بيبعت أوامر متشفّرة للمحرك. الصق ENGINE_KEY في الشيت مرة واحدة.",
  "أهم إعداد: الإيميل اللي العملاء هيشوفوه، ولازم يكون متفعّل كـ «Send mail as» في Gmail.",
  "اختياري: كل عميل جاهز بيتضاف على بورد monday وبتتحدّث حالته.",
  "خلصنا.",
];

export function StepShell({ step, done, children }: { step: number; done: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <h1 className="text-xl font-semibold">الإعداد لأول مرة</h1>
        {done && <p className="text-xs text-muted-foreground">الإعداد خلص قبل كده — تقدر تعيد أي خطوة.</p>}
        <StepBar step={step} />
      </div>
      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
        <div><h2 className="font-semibold">{step}. {STEPS[step - 1]}</h2><p className="text-sm text-muted-foreground">{DESC[step - 1]}</p></div>
        {children}
      </section>
    </div>
  );
}

export const FirstCompanyStep = FirstCompany;
export const WaitStep = WaitForLink;
export const FinishStep = Finish;
