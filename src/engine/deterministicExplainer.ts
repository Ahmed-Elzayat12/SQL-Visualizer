import type { LogicalOperation } from '../types/sql';
import type { StepExecutionResult } from '../types/execution';

/**
 * Deterministic Explainer Engine with English and authentic Egyptian Arabic.
 * Translates low-level SQL semantics into crystal-clear conceptual explanations.
 */
export function getDetailedStepExplanation(
  op: LogicalOperation,
  stepResult?: StepExecutionResult,
  lang: 'en' | 'ar_eg' = 'ar_eg'
): {
  summary: string;
  whyItExists: string;
  dataTransformation: string;
  performanceNote: string;
  faqAnswers: { question: string; answer: string }[];
} {
  const isAr = lang === 'ar_eg';

  switch (op.type) {
    case 'DISTINCT_ON': {
      if (isAr) {
        return {
          summary: 'الخطوة دي بتختار أول سجل فريد بس لكل قيمة في المفتاح المحدد (زي vehicleId) بناءً على ترتيب الـ ORDER BY.',
          whyItExists: 'بدل ما نعمل Subquery معقدة بـ ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)، ميزة DISTINCT ON في PostgreSQL بتسمح لنا نلقط أحدث Fix أو أحدث Batch بخطوة مباشرة وسريعة.',
          dataTransformation: `البيانات بتترتب الأول حسب الترتيب المطلوب (تنازلي مثلاً)، وبعدين بنثبت أول سطر لكل عربية، وبنستبعد أي سطور مكررة تانية. النتيجة إن كل عربية بيطلعلها سطر واحد بس.`,
          performanceNote: 'مهم جداً وجود Index مركب (Composite Index) بيبدأ بأعمدة الـ DISTINCT ON وبعدها أعمدة الـ ORDER BY عشان نتفادى عملية Sort كاملة في الـ Memory.',
          faqAnswers: [
            {
              question: 'ليه الـ DISTINCT ON اختار السجل ده بالذات واستبعد الباقي؟',
              answer: 'لأن الـ ORDER BY بيحدد الأسبقية. السطر اللي كان في القمة في الترتيب (أحدث وقت مثلاً) هو اللي اتاخد، وأي سطر تاني لنفس الـ vehicleId اتعمله discard.',
            },
            {
              question: 'إيه اللي يحصل لو سجلين ليهم نفس الـ Timestamp بالضبط؟',
              answer: 'لو مفيش عمود تاني يحسم التعادل (Tie-breaker زي id مثلاً)، الـ PostgreSQL هتختار سطر غير محدد (Non-deterministic) حسب مكانه على الديسك. يفضل دايماً تحط id في الـ ORDER BY عشان تضمن نتيجة ثابتة.',
            },
          ],
        };
      }
      return {
        summary: 'Picks the very first row for each distinct key (e.g. vehicleId) based on the specified ORDER BY clause.',
        whyItExists: 'Avoids complex window functions like ROW_NUMBER() when you only need the latest or top-ranked record per entity.',
        dataTransformation: 'Rows are sorted by partition keys and order expressions. The first row in each group is emitted, while all subsequent duplicates are dropped.',
        performanceNote: 'Requires sorting unless a matching composite index (vehicleId, eventTime DESC) is available for an Index Scan.',
        faqAnswers: [
          {
            question: 'Why did DISTINCT ON select this specific record?',
            answer: 'Because of the ORDER BY evaluation: the row with the latest timestamp came first in the sort order and was preserved.',
          },
          {
            question: 'What happens if two records have identical timestamps?',
            answer: 'PostgreSQL will pick an arbitrary row unless a secondary deterministic column (like id) is included in the ORDER BY.',
          },
        ],
      };
    }

    case 'GROUP_BY_AGGREGATE': {
      if (isAr) {
        return {
          summary: 'تجميع السطور المشتركة في نفس المفتاح وحساب إحصائيات مجمعة (COUNT, SUM, MAX, MIN).',
          whyItExists: 'حساب ملخصات عن كل كيان، زي إجمالي عدد النقط المسجلة لكل عربية، أو أحدث وقت إشارة.',
          dataTransformation: `الأسطر المتعددة لنفس الـ vehicleId بتنكمش في سطر واحد بيمثل المجموعة، مع حساب التجميعات زي SUM(pointCount) وCOUNT(*) FILTER.`,
          performanceNote: 'لو حجم المجموعات كبير ومعدي الـ work_mem، الـ PostgreSQL بتضطر تستخدم Disk Temp Files. راقب الـ HashAggregate في EXPLAIN ANALYZE.',
          faqAnswers: [
            {
              question: 'إيه فايدة خاصية FILTER (WHERE ...) جوه الـ COUNT؟',
              answer: 'دي ميزة قوية في PostgreSQL بتسمحلك تعد بس السطور اللي بتحقق شرط معين (مثلاً pointCount > 0) جوه نفس عملية الـ GROUP BY بدون ما تفلتر باقي الإحصائيات.',
            },
            {
              question: 'هل الـ NULLs بتدخل في الحساب؟',
              answer: 'الـ COUNT(*) بيعد كل السطور بما فيها الـ NULLs، لكن SUM وAVG ودوال التجميع العادية بتتجاهل قيم الـ NULL تلقائياً.',
            },
          ],
        };
      }
      return {
        summary: 'Aggregates multiple rows sharing the same key into a single summary row per group.',
        whyItExists: 'Condenses raw batch records into high-level metrics (totals, counts, timestamps).',
        dataTransformation: 'Multiple records per vehicle are collapsed into 1 row with calculated aggregate values.',
        performanceNote: 'Check work_mem size. If the hash table exceeds memory, PostgreSQL spills HashAgg buckets to temp disk files.',
        faqAnswers: [
          {
            question: 'How does the aggregate FILTER clause work?',
            answer: 'PostgreSQL evaluates the FILTER predicate per row inside the aggregate, counting or summing only matching rows without dropping non-matching rows from the overall group.',
          },
        ],
      };
    }

    case 'WHERE_FILTER': {
      if (isAr) {
        return {
          summary: 'فلترة وتصفية السطور بالاعتماد على شروط منطقية (Predicates).',
          whyItExists: 'استبعاد البيانات غير الصالحة، السجلات التالفة، أو الاختبارية قبل ما ندخل في حسابات وتجميعات ثقيلة.',
          dataTransformation: 'كل سطر بيتقيم: لو الشرط طلع TRUE السطر بيكمل. لو FALSE أو NULL بيتم استبعاده فوراً.',
          performanceNote: 'التصفية المبكرة (Early Filtering) في أول CTE بتوفر استهلاك الرامات وبتسرع الـ JOINs اللي هتيجي بعدها بشكل درامي.',
          faqAnswers: [
            {
              question: 'ليه سطر معين تم استبعاده؟',
              answer: 'السطر تم استبعاده لأنه ما استوفاش شرط الـ WHERE (مثلاً pointCount كان 0 أو مساوي لـ NULL).',
            },
            {
              question: 'إزاي الـ NULL بيتعامل في الـ WHERE؟',
              answer: 'في SQL، مقارنة أي قيمة مع NULL بتطلع UNKNOWN مش TRUE، وبالتالي الـ WHERE بتستبعد السطر تلقائياً.',
            },
          ],
        };
      }
      return {
        summary: 'Evaluates boolean predicates against every candidate row, keeping only those where the condition is TRUE.',
        whyItExists: 'Discards corrupted, test, or out-of-scope records early in the data pipeline.',
        dataTransformation: 'Rows passing the condition are preserved; false or unknown (NULL) rows are dropped.',
        performanceNote: 'Early filtering drastically reduces the working set size before expensive joins and aggregations.',
        faqAnswers: [
          {
            question: 'Why was this row excluded?',
            answer: 'The row failed one of the WHERE clauses (e.g. pointCount was 0 or source matched excluded list).',
          },
        ],
      };
    }

    case 'JOIN': {
      if (isAr) {
        return {
          summary: `دمج بيانات من جدولين أو CTEs بناءً على شرط تطابق (Join Key).`,
          whyItExists: 'ربط الإحصائيات المجمعة (Totals) مع أحدث Fix ومعلومات الـ Sources لتكوين صورة متكاملة عن حالة العربية.',
          dataTransformation: 'لو التطابق تم بنجاح، بتندمج أعمدة الجدولين في سطر واحد عريض. لو LEFT JOIN واليمين مش موجود، بنملى خانات اليمين بـ NULL.',
          performanceNote: 'تأكد من وجود Index على الـ Foreign Keys. لو الجداول صغيرة PostgreSQL بتفضل Hash Join، ولو كبيرة وفيه Index بتستخدم Nested Loop أو Merge Join.',
          faqAnswers: [
            {
              question: 'ليه فيه قيم NULL ظهرت بعد الـ LEFT JOIN؟',
              answer: 'لأن الـ LEFT JOIN بيحافظ على كل سطور الجدول الشمال حتى لو ملهاش أي سطر مطابق في الجدول اليمين، فبيحط قيم NULL للأعمدة اللي جاية من اليمين.',
            },
            {
              question: 'هل الـ JOIN ده ممكن يضاعف عدد السطور؟',
              answer: 'نعم! لو الجدول اليمين فيه أكتر من سطر لنفس الـ vehicleId، كل سطر هيتكرر. عشان كده استخدمنا CTE فيها DISTINCT ON قبل الـ JOIN عشان نضمن 1-to-1 match!',
            },
          ],
        };
      }
      return {
        summary: 'Combines columns from two relation sources based on common join keys.',
        whyItExists: 'Brings together aggregate statistics and latest GPS coordinates into a unified record.',
        dataTransformation: 'Rows matching the ON condition are merged horizontally. Missing right rows in LEFT JOIN get filled with NULLs.',
        performanceNote: 'Verify join column indexes to prevent slow O(N*M) nested loops.',
        faqAnswers: [
          {
            question: 'Why are there NULL values after this LEFT JOIN?',
            answer: 'The vehicle existed on the left relation, but had no corresponding record on the right relation.',
          },
          {
            question: 'Could this JOIN create duplicate rows?',
            answer: 'It would if the right side had multiple rows per vehicleId. Using a DISTINCT ON CTE on the right side prevents row multiplication.',
          },
        ],
      };
    }

    default: {
      if (isAr) {
        return {
          summary: op.descriptionAr || 'تنفيذ خطوة منطقية في مسار معالجة البيانات.',
          whyItExists: 'تحويل وتجهيز البيانات للمراحل التالية.',
          dataTransformation: 'تطبيق العمليات الحسابية أو الإسقاط المطلوب على السطور.',
          performanceNote: 'مراجعة خطة التنفيذ للتأكد من كفاءة استهلاك الموارد.',
          faqAnswers: [],
        };
      }
      return {
        summary: op.descriptionEn || 'Executes a logical query transformation step.',
        whyItExists: 'Transforms dataset for downstream consumers.',
        dataTransformation: 'Applies projections or scalar calculations to input rows.',
        performanceNote: 'Check plan cost and row counts.',
        faqAnswers: [],
      };
    }
  }
}
