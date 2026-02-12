제목: GDP: 대규모 언어 모델 기반의 생성형 디지털 트윈 프로토타이퍼를 활용한 대화형 공정 설계 및 최적화 (GDP: Generative Digital-twin Prototyper for Interactive Process Planning and Optimization using Large Language Models)

초록

스마트 제조(Smart Manufacturing) 환경에서 디지털 트윈(Digital Twin)은 공정 모니터링과 효율화를 위한 핵심 기술로 자리 잡았다. 그러나 기존의 시뮬레이션 구축 방식은 복잡한 3D 모델링 및 프로그래밍 전문 지식을 요구하여 초기 설계 단계에서의 진입 장벽이 높고, 많은 시간과 비용이 소요된다는 한계가 있다. 또한, 보안상의 이유로 실제 제조 데이터(Bill of Process, BOP) 접근이 제한됨에 따라, 다양한 시나리오를 검증하기 위한 데이터 확보에 어려움이 존재한다.

본 연구에서는 이러한 문제를 해결하기 위해 거대 언어 모델(LLM)의 추론 능력과 웹 기반 3D 시각화 기술을 결합한 새로운 공정 설계 프레임워크인 **'GDP (Generative Digital-twin Prototyper)'**를 제안한다. GDP는 사전에 정의된 템플릿 없이 LLM의 잠재 지식(Latent Knowledge)을 활용하여 사용자의 자연어 명령만으로 제조 공정 데이터(BOP)를 즉시 생성하는 제로샷(Zero-shot) 생성 기법을 적용하였다. 생성된 데이터는 웹 기반의 경량화된 3D 뷰어를 통해 실시간으로 시각화되며, 공정 간 연결성 및 물리적 제약을 고려한 자동 레이아웃(Auto-layout) 알고리즘이 적용된다.

나아가 본 시스템은 단순한 시각화를 넘어, 대화형 인터페이스를 통해 공정의 병목 현상(Bottleneck)을 진단하고 개선안을 도출하는 에이전트 기반 최적화(Agentic Optimization) 기능을 수행한다. 사용자가 생산량 증대나 인원 최적화 등의 목표를 제시하면, 시스템은 외부 최적화 도구(External Tools)를 호출하여 논리적인 해결책을 제안하고 시뮬레이션에 반영한다.

자전거 제조 공정 구축 시나리오를 통한 실험 결과, 제안된 시스템은 비전문가도 수 분 내에 논리적으로 타당한 디지털 트윈 프로토타입을 구축할 수 있음을 입증하였다. 본 연구는 확률적인 생성형 AI 모델을 확정적인 엔지니어링 제약조건과 결합하는 뉴로-심볼릭(Neuro-Symbolic) 접근법을 통해, 제조 공정 설계의 접근성을 획기적으로 높이고 공학 소프트웨어의 민주화(Democratization)에 기여한다는 점에서 학술적 의의를 갖는다.

핵심어: 생성형 AI(Generative AI), 디지털 트윈(Digital Twin), 공정 설계(Process Planning), 대규모 언어 모델(LLM), 인간-AI 상호작용(Human-AI Interaction)