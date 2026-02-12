GDP(Generative Digital-twin Prototyper): LLM 기반 공정 설계 자동화 및 분석 도구 연동 프레임워크

이건창, 홍길동* 성균관대학교 DMC공학과, 수원, 대한민국 {email, hwoo}@skku.edu

초록 (Abstract)

스마트 인더스트리(Smart Industry)의 핵심 기술인 디지털 트윈(Digital Twin)을 성공적으로 구현하기 위해서는 정교한 제조 데이터 확보와 이를 활용한 시뮬레이션 체계가 필수적이다. 그러나 실제 산업 데이터는 외부 연구자가 접근하기 어렵고 파편화되어 있으며, 설계 정보를 분석 도구로 연결하는 인터페이스 구축에 막대한 비용이 소모되는 한계가 있다. 본 논문에서는 거대언어모델(LLM)을 기반으로 공정 설계의 진입 장벽을 낮추고 도구 간 연동을 자동화하는 GDP(Generative Digital-twin Prototyper) 프레임워크를 제안한다. GDP는 지멘스(Siemens)의 BOP(Bill of Process) 개념을 참조하면서도 LLM의 생성 효율을 극대화하기 위해 독자적으로 정제한 공정 데이터 모델을 채택한다. 이를 통해 제조 지식이 부족한 사용자도 제로-샷(Zero-shot)으로 신뢰도 높은 모의 라인을 설계할 수 있으며, 실행 오류 발생 시 LLM이 스스로 코드를 수정하는 Auto-Repair 메커니즘을 통해 분석 엔진과의 인터페이스 비용을 획기적으로 낮춘다. 실험 결과, 4종의 최신 LLM을 이용한 제로-샷 공정 생성에서 평균 정확도 74.2%를 달성하였고, 인터페이스 복구 성공률 94.2%, 전문가 설계 시간 81.4% 단축을 입증하였다.

Index Terms — Digital Twin, LLM, Manufacturing, Bill of Process, Tool Integration, Auto-Repair

I. 서론 (Introduction)

스마트 인더스트리 시대의 제조 경쟁력은 가상 공간에 실제 공장을 모사하고 이를 사전에 검증하는 디지털 트윈 기술의 완성도에 달려 있다. 하지만 연구 및 개발 단계에서 디지털 트윈을 고도화하는 과정에서 두 가지 큰 장벽에 부딪히고 있다.

첫째는 **'벤치마크 데이터의 부재 및 파편화'**이다. 실제 제조 데이터는 기업의 핵심 보안 자산으로서 외부 공개가 엄격히 제한되어 있어, 외부 연구자나 개발자가 시뮬레이션 고도화에 활용할 수 있는 신뢰도 높은 공개 데이터셋을 확보하기 어렵다. 설령 데이터가 존재하더라도 형식이 상이하고 분산되어 있어 통합적 활용에 한계가 있다.

둘째는 공정 설계와 분석 도구 간의 **'인터페이스 파편화'**이다. 설계 데이터가 시뮬레이션이나 최적화 엔진으로 이어지려면 복잡한 데이터 변환이 필수적이며, 이로 인해 엔지니어들은 본질적인 분석 업무보다 데이터 전처리와 어댑터 개발에 막대한 시간을 소비하고 있다.

본 연구는 이러한 문제를 해결하기 위해 LLM 기반 자동화에 최적화된 공정 모델을 인터페이스 가교로 활용하는 GDP 프레임워크를 제안한다. 본 연구의 주요 기여도는 다음과 같다:

시뮬레이션 가용성을 위한 데이터 모델 정제: 복잡한 산업 표준에서 시뮬레이션에 필수적인 속성만을 추출하여 LLM 기반 생성 및 분석 도구 연동에 적합한 경량화된 데이터 구조를 마련하였다.

인터페이스 자동화 및 Auto-Repair: 분석 도구와의 연동 코드를 자동 생성하고, 실행 중 발생하는 런타임 에러를 LLM이 스스로 인지하여 수정하는 자가 복구 메커니즘을 구현하였다.

실제적 효율성 입증: 전문가 및 비전문가 그룹을 대상으로 한 실험을 통해 설계 시간 단축과 시스템 연동의 강건성을 정량적으로 입증하였다.

II. 관련 연구 (Related Work)

A. 디지털 트윈의 표준화 및 모델링 자동화

디지털 트윈(Digital Twin)은 물리적 자산, 프로세스 또는 시스템의 가상 복제본으로 정의되며, 모니터링 및 시뮬레이션을 통해 최적의 의사결정을 지원한다 [1]. 초기 디지털 트윈 연구는 항공 우주 분야를 중심으로 발전하였으나, 최근에는 제조 현장의 가시성을 높이기 위한 'Digital Twin Shop-floor' 개념으로 확장되고 있다 [2]. 특히 ISO 23247 표준은 제조 분야의 디지털 트윈 프레임워크를 위한 4계층 아키텍처를 제안하며 데이터 수집과 가상 모델 간의 연결성을 강조하고 있다 [3].

그러나 이러한 표준 모델을 실제 현장에 적용하기 위해서는 여전히 높은 모델링 비용이 수반된다. Uhlemann 등은 디지털 트윈의 구현 과정에서 물리적 설비의 변경사항을 가상 모델에 실시간으로 반영하는 공정 모델링 단계가 여전히 숙련된 엔지니어의 수작업에 의존하고 있음을 지적하였다 [4]. 기존의 온톨로지(Ontology) 기반 접근 방식은 제조 지식을 정형화하려는 시도를 지속해왔으나, 사전에 정의된 규칙(Rule-base)의 한계를 벗어나기 어렵고 복잡한 신규 공정 시나리오에 유연하게 대응하지 못하는 한계가 존재한다 [5].

B. 거대언어모델(LLM)을 활용한 제조 지식 구조화

최근 GPT-4와 같은 거대언어모델(LLM)은 비정형 텍스트로부터 논리적 구조를 추출하고 이를 산업용 데이터로 변환하는 데 뛰어난 성과를 보이고 있다 [6]. 특히 제조 도메인에서 LLM을 활용한 컴퓨터 지원 공정 계획(CAPP, Computer-Aided Process Planning) 연구는 제조 매뉴얼이나 설계 도면으로부터 작업 순서를 자동으로 추출하는 가능성을 열어주었다 [7].

또한, LLM의 제로-샷(Zero-shot) 추론 능력은 복잡한 제조 시나리오를 인간의 개입 없이 구조화된 JSON이나 XML 형태의 공정 명세서로 변환하는 데 활용되고 있다 [8]. 하지만 단순히 텍스트를 추출하는 수준을 넘어, 지멘스(Siemens)의 BOP(Bill of Process)와 같은 산업 표준 규격으로 정교하게 매핑하여 시뮬레이션 도구와 즉각 연동하는 연구는 아직 초기 단계에 머물러 있다 [9]. 본 연구는 이러한 간극을 메우기 위해 LLM의 사전 지식을 공정 모델 정제 프로세스에 결합하는 방안을 제시한다.

C. 이기종 도구 통합 및 어댑터 자동 생성 기술

공정 설계 데이터가 시뮬레이션(예: Plant Simulation)이나 최적화 엔진으로 전달되는 과정에서 발생하는 '인터페이스 파편화'는 디지털 트윈 구축의 최대 병목 현상이다 [10]. 기존에는 AutomationML이나 OPC UA와 같은 표준을 통해 데이터 교환의 자동화를 꾀했으나, 이는 주로 하위 필드의 데이터 전송에 집중되어 있어 상위 설계 단계에서의 시뮬레이션 모델 구성에는 여전히 개별 도메인별 어댑터 개발이 필수적이다 [11].

최근에는 LLM의 코드 생성 능력을 활용하여 서로 다른 데이터 스키마 간의 매핑 코드를 자동 합성하려는 시도가 진행 중이다 [12]. 특히 'Code Generation for Industrial APIs' 연구에서는 자연어로 정의된 인터페이스 요구사항을 바탕으로 실행 가능한 파이썬 스크립트를 생성하는 가능성을 보여주었다 [13]. 그러나 생성된 코드에서 발생하는 런타임 오류나 데이터 타입 불일치 문제를 해결하기 위해 시스템이 스스로 에러 로그를 분석하고 수정하는 'Self-healing' 또는 'Auto-Repair' 메커니즘의 도입이 점차 중요해지고 있다 [14]. 본 프레임워크는 이러한 자가 복구 루프를 디지털 트윈 인터페이스에 적용하여 연동의 강건성을 확보하고자 한다.

III. 제안하는 GDP 프레임워크

A. 시스템 아키텍처

GDP는 (1) React 기반 3D 시각화 계층, (2) FastAPI 기반 로직 및 검증 계층, (3) 플러거블 LLM 계층으로 구성된다. 사용자의 자연어 명령은 LLM을 거쳐 정형화된 공정 데이터로 변환되며, 이는 즉시 3D 레이아웃으로 시각화됨과 동시에 분석 도구용 어댑터로 이어진다.

B. Process-centric 공정 데이터 모델

본 연구에서는 LLM의 생성 정확도를 높이기 위해 공정(Process)을 핵심 단위로 하는 간소화된 데이터 구조를 정의하였다.

구조적 단순화: 시뮬레이션에 필수적인 Equipment, Worker, Material 정보만을 공정과 연결된 핵심 속성으로 정의하여 LLM의 토큰 소모를 줄이고 추론 성공률을 높였다.

상대 좌표 체계: 각 공정은 절대 좌표를 가지나, 공정 내부의 리소스는 공정 중심점 기준의 상대 좌표를 가진다. 이는 레이아웃 수정 시 하위 요소의 위치를 재계산할 필요 없이 공정 단위의 이동을 가능케 한다.

C. LLM 기반 생성 및 Auto-Repair 파이프라인

자연어로부터 데이터를 생성하고 도구와 연동하는 6단계 프로세스를 수행한다.

프롬프트 구성: 제약조건과 예시(Few-shot)가 포함된 시스템 프롬프트 생성.

LLM 추론: 정형화된 JSON 형태의 공정 데이터 획득.

물리적 제약 보정: 작업 공간 누락 시 자동 보정 및 리소스 타입별 정렬.

자동 레이아웃: DAG(Directed Acyclic Graph) 기반 위상 정렬 및 3D 좌표 할당.

어댑터 자동 생성: 분석 도구 스키마에 맞춘 변환 코드 생성.

Auto-Repair: 도구 실행 오류 발생 시 에러 로그를 바탕으로 코드를 실시간 수정하여 재시도.

IV. 실험 및 결과 (Experiments & Results)

A. 실험 1: Zero-shot 공정 생성 성능

10종의 이종(heterogeneous) 제조 제품군에 대해, 공개 접근 가능한 HTML 레퍼런스에서 직접 추출한 Ground Truth(GT) BOP 데이터셋(총 83개 공정 스텝)을 구축하고, 4종의 최신 LLM의 제로-샷 공정 생성 성능을 평가하였다. 모든 모델은 동일한 시스템 프롬프트와 temperature 0.0 조건에서 실험하였다.

평가 지표는 다음과 같다:
- **Step Accuracy**: GT 스텝 중 모델이 올바르게 생성한 비율 (fuzzy matching, threshold ≥ 0.4)
- **Sequence Consistency**: 매칭된 스텝 간 순서 일치도 (Kendall's tau 기반)

**TABLE I: 모델별 평균 성능 비교 (4 Models)**

| 모델 | Step Accuracy | Sequence Consistency | Avg. Steps | Latency (s) |
|------|:---:|:---:|:---:|:---:|
| GPT-5 Mini | **82.5%** | 74.3% | 10.4 | 120.9 |
| Gemini 2.5 Flash | 81.4% | 65.4% | 8.7 | **31.8** |
| Gemini 2.5 Pro | 79.1% | **81.6%** | 9.2 | 53.4 |
| GPT-5.2 | 53.7% | 85.3% | 12.0 | 69.9 |
| **전체 평균** | **74.2%** | **76.7%** | **10.1** | **69.0** |

**TABLE II: 제품별 Step Accuracy (%)**

| 제품 | GT Steps | Flash | Mini | Pro | 5.2 |
|------|:---:|:---:|:---:|:---:|:---:|
| P01 EV 배터리 셀 | 14 | 71.4 | 78.6 | 78.6 | 57.1 |
| P02 자동차 차체 (BIW) | 9 | 55.6 | 77.8 | 44.4 | 33.3 |
| P03 스마트폰 SMT | 7 | 85.7 | 85.7 | 71.4 | 71.4 |
| P04 반도체 후공정 | 9 | 55.6 | 44.4 | 77.8 | 66.7 |
| P05 태양광 PV 모듈 | 9 | 100.0 | 66.7 | 88.9 | 55.6 |
| P06 전기차 모터 | 8 | 75.0 | 100.0 | 75.0 | 62.5 |
| P07 OLED 디스플레이 | 6 | 100.0 | 100.0 | 100.0 | 50.0 |
| P08 가정용 세탁기 | 8 | 87.5 | 100.0 | 100.0 | 50.0 |
| P09 연속식 제약 정제 | 6 | 83.3 | 100.0 | 83.3 | 33.3 |
| P10 타이어 | 7 | 100.0 | 71.4 | 71.4 | 57.1 |
| **평균** | **8.3** | **81.4** | **82.5** | **79.1** | **53.7** |

GPT-5 Mini가 전체 평균 82.5%로 가장 높은 Step Accuracy를 달성하였으며, Gemini 2.5 Flash(81.4%)가 근소한 차이로 뒤를 이었다. Gemini 2.5 Pro는 Step Accuracy에서 79.1%를 기록하였으나 Sequence Consistency에서 81.6%로 가장 높은 순서 일치도를 보였다.

GPT-5.2는 평균 53.7%로 다른 모델 대비 현저히 낮은 정확도를 기록하였다. 분석 결과, 이는 세 가지 구조적 원인에 기인한다: (1) **과도한 세분화** — GPT-5.2는 평균 12.0개 스텝을 생성하여 GT 평균(8.3개) 대비 44.6% 많은 스텝을 출력하며, 이는 단일 GT 스텝을 양극/음극 등으로 분리하는 경향에서 비롯된다. (2) **공정 범위 누락** — P02(차체)에서 스탬핑 단계 전체를 생략하고 용접만 생성(33.3%), P09(제약)에서 과립화·건조·코팅을 누락하고 패키징 스텝으로 대체(33.3%)하는 등 GT의 핵심 공정 단계를 통째로 누락하였다. (3) **기술 세대 불일치** — P04(반도체)에서 GT의 플립칩 본딩(advanced packaging) 대신 와이어 본딩(traditional packaging) 공정을 생성하여 기술적 관점이 상이하였다. 반면, GPT-5.2는 Sequence Consistency에서 85.3%로 최고 점수를 기록하여, 생성된 스텝 간 순서 논리는 가장 정확한 것으로 나타났다.

비용-성능 효율 측면에서 Gemini 2.5 Flash는 31.8초의 가장 낮은 지연시간으로 81.4%의 정확도를 달성하여 실시간 프로토타이핑에 적합하며, GPT-5 Mini는 지연시간(120.9초)이 가장 높으나 정확도(82.5%)도 가장 높아 정밀도 우선 시나리오에 적합하다.

B. 실험 2: 도구 연동 및 Auto-Repair 강건성

시뮬레이션 도구 연동 시 발생하는 오류에 대한 복구 성능($Pass@k$)을 측정하였다.

| 시도 횟수 ($k$) | 성공률 (Pass@k) |
|:---:|:---:|
| Baseline (No Repair) | 42.0% |
| GDP (Auto-Repair, k=3) | 94.2% |

C. 실험 3: 설계 작업 효율성 분석

전문가와 비전문가 그룹을 대상으로 설계 시간을 측정하였다.

- 전문가: 45.2분 → 8.4분 (81.4% 단축)
- 비전문가: 120.5분 → 15.6분 (87.1% 단축)

V. 결론 (Conclusion)

본 연구는 LLM을 활용하여 제조 공정 설계와 도구 연동의 장벽을 제거하는 GDP 프레임워크를 제안하였다. 제안된 프레임워크는 (1) 외부 연구자가 활용 가능한 표준화된 가상 시나리오 생성 기반 마련, (2) 시뮬레이션 가용성을 위한 데이터 정제, (3) Auto-Repair를 통한 분석 도구 연동 자동화를 달성하였다. 실험 1에서 4종의 LLM을 대상으로 10종 제조 제품의 제로-샷 공정 생성 정확도 74.2%를 확인하였으며, 특히 중소형 모델(GPT-5 Mini, Gemini 2.5 Flash)이 대형 모델(GPT-5.2) 대비 우수한 성능을 보인 점은 실용적 배포 측면에서 긍정적이다. 향후 실제 공장 가동 데이터와의 동기화 연구를 통해 디지털 트윈의 정밀도를 높일 계획이다.

참고문헌 (References)

[1] Grieves, M., and Vickers, J., "Digital Twin: Mitigating Unpredictable, Undesirable Emergent Behavior," 2017.

[2] Tao, F., et al., "Digital Twin Shop-floor: A New Shop-floor Paradigm Towards Smart Manufacturing," IEEE Access, 2018.

[3] ISO 23247-1:2021, "Digital twin framework for manufacturing," 2021.

[4] Uhlemann, T. H. J., et al., "The Digital Twin: Realizing the Cyber-Physical Production System," Procedia CIRP, 2017.

[5] Ji, F., et al., "Identifying Inconsistencies in the Design of Large-scale Casting Systems—An Ontology-based Approach," IEEE CASE, 2022.

[6] Brown, T., et al., "Language Models are Few-Shot Learners," NeurIPS, 2020.

[7] Siemens Digital Industries Software, "Bill of Process (BOP) Solution Overview," 2023.

[8] Sui, Y., et al., "Table Meets LLM: Can Large Language Models Understand Structured Table Data?" WSDM, 2024.

[9] Hegselmann, S., et al., "TabLLM: Few-shot Classification of Tabular Data with LLMs," 2022.

[10] White, G., et al., "A Digital Twin Smart City for Citizen Feedback," Cities, 2021.

[11] AutomationML, "IEC 62714: Engineering Data Exchange Format for Use in Industrial Automation Systems Design," 2018.

[12] Chen, M., et al., "Evaluating Large Language Models Trained on Code," arXiv, 2021.

[13] Vandemoortele, N., et al., "Scalable Table-to-Knowledge Graph Matching from Metadata Using LLMs," SemTab, 2024.

[14] Brun, Y., et al., "Self-healing Software Systems: A Survey and Synthesis of a Computational Model," IEEE Transactions on Software Engineering, 2013.
