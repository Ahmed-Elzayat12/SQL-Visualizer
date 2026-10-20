export const SAMPLE_EXPLAIN_JSON = JSON.stringify([
  {
    "Plan": {
      "Node Type": "Sort",
      "Parallel Aware": false,
      "Startup Cost": 142.15,
      "Total Cost": 144.65,
      "Plan Rows": 1000,
      "Plan Width": 72,
      "Actual Startup Time": 1.842,
      "Actual Total Time": 1.954,
      "Actual Rows": 8,
      "Actual Loops": 1,
      "Sort Key": ["l.totalPoints DESC"],
      "Sort Method": "quicksort",
      "Sort Space Used": 25,
      "Sort Space Type": "Memory",
      "Shared Hit Blocks": 18,
      "Shared Read Blocks": 0,
      "Plans": [
        {
          "Node Type": "Hash Left Join",
          "Parent Relationship": "Outer",
          "Parallel Aware": false,
          "Join Type": "Left",
          "Startup Cost": 55.20,
          "Total Cost": 92.40,
          "Plan Rows": 1000,
          "Plan Width": 72,
          "Actual Startup Time": 0.850,
          "Actual Total Time": 1.620,
          "Actual Rows": 8,
          "Actual Loops": 1,
          "Hash Cond": "(t.vehicleId = f.vehicleId)",
          "Shared Hit Blocks": 14,
          "Plans": [
            {
              "Node Type": "HashAggregate",
              "Parent Relationship": "Outer",
              "Startup Cost": 25.00,
              "Total Cost": 35.00,
              "Plan Rows": 100,
              "Plan Width": 48,
              "Actual Startup Time": 0.420,
              "Actual Total Time": 0.610,
              "Actual Rows": 5,
              "Actual Loops": 1,
              "Group Key": ["filtered.vehicleId"],
              "Planned Partitions": 0,
              "HashAgg Batches": 1,
              "Peak Memory Usage": 32,
              "Shared Hit Blocks": 8,
              "Plans": [
                {
                  "Node Type": "CTE Scan",
                  "Parent Relationship": "Outer",
                  "CTE Name": "filtered",
                  "Alias": "filtered",
                  "Startup Cost": 0.00,
                  "Total Cost": 20.00,
                  "Plan Rows": 1000,
                  "Plan Width": 32,
                  "Actual Startup Time": 0.045,
                  "Actual Total Time": 0.280,
                  "Actual Rows": 8,
                  "Actual Loops": 1
                }
              ]
            },
            {
              "Node Type": "Hash",
              "Parent Relationship": "Inner",
              "Startup Cost": 15.00,
              "Total Cost": 15.00,
              "Plan Rows": 50,
              "Plan Width": 24,
              "Actual Startup Time": 0.380,
              "Actual Total Time": 0.380,
              "Actual Rows": 5,
              "Actual Loops": 1,
              "Peak Memory Usage": 16,
              "Plans": [
                {
                  "Node Type": "Unique",
                  "Parent Relationship": "Outer",
                  "Startup Cost": 10.00,
                  "Total Cost": 14.00,
                  "Plan Rows": 50,
                  "Plan Width": 24,
                  "Actual Startup Time": 0.120,
                  "Actual Total Time": 0.320,
                  "Actual Rows": 5,
                  "Actual Loops": 1,
                  "Plans": [
                    {
                      "Node Type": "Sort",
                      "Parent Relationship": "Outer",
                      "Startup Cost": 8.00,
                      "Total Cost": 9.50,
                      "Plan Rows": 80,
                      "Plan Width": 24,
                      "Actual Startup Time": 0.090,
                      "Actual Total Time": 0.180,
                      "Actual Rows": 8,
                      "Actual Loops": 1,
                      "Sort Key": ["filtered_1.vehicleId", "filtered_1.eventTime DESC"],
                      "Sort Method": "quicksort",
                      "Sort Space Used": 18,
                      "Sort Space Type": "Memory"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    "Planning Time": 0.428,
    "Execution Time": 2.115
  }
], null, 2);
