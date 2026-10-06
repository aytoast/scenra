const content = {
  "zh": {
    "title": "Scenra｜导演台",
    "description": "Scenra 导演台项目提案：结合 World Labs、Tripo、ARDY 与 Rapier，探索视频生成中的精细控制。",
    "skip": "跳到正文",
    "kind": "项目提案 / 工作原型",
    "heading": "Scenra 导演台",
    "subtitle": "视频生成导演台的环境、动作、物理与机位控制。",
    "meta": "TRIPOTHON S1 · World Labs / Tripo / ARDY / Rapier",
    "abstractTitle": "摘要",
    "abstract": [
      "导演台已经是 AI 视频创作中熟悉的一环：让 LLM 组织场景，在 Blender 等三维工作区安排人物与机位，用 Perspective Camera 拍摄，再将视频作为生成参考。Higgsfield 展示的三维场景到参考视频工作流，也沿着这条路径展开。<sup><a href=\"#ref-6\">[6]</a></sup>",
      "继续往人物表演和场景交互做细，导演台需要补齐另一组能力。仅靠 LLM 编排动作、拆解场景和组织模型，容易留下僵硬的动作与不完整的交互。因此，粗白模常被用来交代构图与走位，把动作细节留给视频模型。Scenra 用 World Labs 构建环境、Tripo 生成独立道具、ARDY 提供人物动作、Rapier 计算物理交互，尝试把这部分内容也放进导演台。",
      "这样做的意义在于控制：人物姿势与动作可以落到空间和时间参数上，摄影机在同一个虚拟片场中取景，物件运动由接触与物理状态决定。我们也加入了面向 PICO 的 WebXR 模拟流程，探索通过空间设备控制 Perspective Camera，像手持摄影机一样移动、转向与取景。"
    ],
    "launch": "查看工作原型",
    "repo": "项目仓库",
    "contentsTitle": "阅读路径",
    "loading": "正在加载图示…",
    "sections": [
      [
        "question",
        "从机位到表演"
      ],
      [
        "approach",
        "技术分工"
      ],
      [
        "controls",
        "在虚拟片场里"
      ],
      [
        "evaluation",
        "编辑与复用"
      ],
      [
        "next",
        "后续工作"
      ]
    ],
    "question": [
      "三维场景给视频生成提供了明确的参考。人物站在哪里、摄影机朝向哪里、前景如何遮挡，都可以先在导演台里安排。Higgsfield 的 3D Jutsu 将场景、动画时间线与摄影机连接到视频生成：先导出白模视频，再结合人物和环境参考生成镜头。<sup><a href=\"#ref-6\">[6]</a></sup>",
      "构图与走位确定之后，还要把戏做出来。一次挥手需要身体动作连续，一次碰撞需要接触发生在合适的时刻，道具被推动之后需要产生相应运动。LLM 生成场景只是起点，人物动作编排、可交互物件的拆分与建模，都需要各自的能力。场景做得越细，这些环节越直接地影响参考视频的质量。",
      "粗白模减少了这些细节的制作负担，导演用它表达空间与机位，视频模型继续补充表演。我们选择把导演台做细：由环境、资产、动作和物理工具分担工作，让人物表演与物体交互在虚拟环境中运行，再从中拍摄参考。"
    ],
    "background": [
      "视频生成模型从视觉数据中学习运动与交互。Morpheus 使用真实落球、反弹和抛体等实验，提取生成视频中的轨迹，并以动力学和物理不变量评估结果。实验显示，所评估模型的生成视频仍存在物理规律偏差。<sup><a href=\"#ref-1\" aria-label=\"参考文献 1\">[1]</a></sup>",
      "How Far is Video Generation from World Model 在受控二维运动和碰撞实验中研究视频模型的物理泛化。模型在训练分布内表现较好，分布外预测仍有局限。该结果支持对轨迹与碰撞进行明确检查，也说明视觉相似度不足以覆盖物理评估。<sup><a href=\"#ref-2\" aria-label=\"参考文献 2\">[2]</a></sup>",
      "空间控制也有相关路径。GEN3C 使用显式三维缓存，在指定机位下渲染参考视图，以改善相机控制和三维一致性。<sup><a href=\"#ref-3\" aria-label=\"参考文献 3\">[3]</a></sup> Scenra 借鉴显式场景提供参考的思路，当前通过 WebM 交付排演结果；视频模型如何使用这些参考仍需验证。"
    ],
    "approach": [
      "Scenra 将环境生成、道具建模、人物动作和物理模拟分开处理，再让它们共享同一个场景。World Labs 提供环境；Tripo 将需要交互的物件建成独立资产；ARDY 提供人物动作；Rapier 计算刚体的重力与碰撞。LLM 可以组织导演意图，各项工具负责把意图落实到可编辑的场景状态。",
      "项目的连接工作包括：道具与人物使用同一坐标系，动作进入角色时间线，人物碰撞体随身体运动更新，动态道具响应接触，Perspective Camera 从这套场景录制画面。后续模型能力提高时，可以继续替换环境、资产与动作来源，保留已有的控制方式。"
    ],
    "tools": [
      [
        "World Labs",
        "从场景图片构建三维环境。"
      ],
      [
        "Tripo",
        "从道具参考图生成独立 GLB 模型，用于布置与交互。"
      ],
      [
        "Stageon / ARDY",
        "提供保存的人物动作与蒙皮，接入角色时间线。"
      ],
      [
        "Three.js / Rapier",
        "渲染场景，计算已配置刚体的重力与碰撞。"
      ]
    ],
    "sceneCaption": "机位示意 · 从柱后滑出并显露人物，展示空间位置如何改变构图与遮挡。",
    "motionTitle": "动作、接触与重演",
    "motion": [
      "人物按保存的 ARDY 动作回放，每位角色拥有独立时间线，可以调整片段时序、位置与朝向。连续动作数据提供身体运动基础；脚部接触、角色间接触和与道具的配合仍需逐场检查与修正。",
      "Rapier 以配置的重力和碰撞参数运行动态道具，人物的运动学碰撞体可以推动道具。当前交互主要覆盖刚体碰撞。精确抓握、物体附着和完整接触约束仍需接入。",
      "已保存的人物动作可以回放和重新取景。物理交互的逐帧重演需要记录或恢复物理状态；当前原型尚未提供完整的物理状态录制。"
    ],
    "motionCaption": "图 2 · 双人打斗回放，使用保存的 ARDY 动作。此图展示动作来源与同步播放。",
    "prototype": [
      "当前庭院串联了独立道具、保存动作、人物时间线、刚体交互和画布录制。环境与道具生成后可以继续编辑，人物动作可以回放，机位可以重新调整。"
    ],
    "capabilities": [
      "布景：移动、旋转和缩放独立道具，配置静态或动态物理状态，通过界面抓取与释放。",
      "人物：编辑独立动作轨道，调整片段起止时间、位置和朝向，播放、暂停与拖动时间线。",
      "摄影机：移动、平移和旋转，调整 FOV，检查遮挡与构图。",
      "输出：录制当前画布并下载 WebM，界面悬浮控件不进入画布视频。"
    ],
    "workflow": "操作路径：Perspective Camera → Edit Scene → Objects / Actors → Save & Preview → 录制 WebM。",
    "editorLink": "打开场景编辑器",
    "materialNames": [
      "庭院输入图",
      "木凳参考图",
      "茶桌参考图",
      "香炉参考图"
    ],
    "materialNote": "图 3 · 庭院源图与道具参考。环境由 World Labs 构建，道具参考用于 Tripo 模型生成。",
    "evaluationIntro": [
      "人物、道具与摄影机都保留在同一份场景里。一次修改之后，可以继续回看、调整和拍摄；已有布景、动作与镜头安排，也可以作为下一场戏的起点。"
    ],
    "evaluation": [
      [
        "修改有明确对象",
        "改变手部目标、动作时序、道具位置或摄影机朝向，都是对已有状态的编辑。局部决定可以逐项修改，再从镜头里回看。"
      ],
      [
        "素材和表演可以继续使用",
        "保留环境与人物关系，替换道具或动作片段，继续拍摄。随着创作积累，可复用的资产、动作和镜头安排也会增加。"
      ],
      [
        "模型进步可以进入同一工作流",
        "环境、资产与动作模型继续提高时，导演台可以使用更好的内容。空间、时间和物理状态仍由场景保存，摄影机继续从中取景。"
      ]
    ],
    "evaluationEnd": [
      "导演台的方向是让虚拟片场里的表演与交互实际发生，再由摄影机录下来。导演在可编辑的场景中完成局部修改与重拍，视频模型继续承担画面风格和影像处理。"
    ],
    "next": [
      "继续将关节目标、动作速度与接触约束接入人物时间线，补充抓握、物体附着与物理状态记录。让人物动作和场景交互可以一起保存、修改与重演。",
      "空间设备方向继续推进 PICO 实机和镜头轨迹录制；空间监看则考虑 Jupyter S2，让导演与团队共同查看人物距离、前景遮挡和镜头纵深。"
    ],
    "hardwareTitle": "空间监看设想",
    "hardware": [
      "Jupyter S2 作为后续空间监看方向，沿用片场里导演与团队共同回看的工作方式。当前概念布置展示监看位置，设备接入另行推进。"
    ],
    "photoCaption": "AI 生成片场概念照片 · 空间监看位置设想。",
    "layoutLink": "查看概念布置图",
    "referencesTitle": "参考文献与工具",
    "references": [
      [
        "Evaluating Newtonian Mechanics in Video Generative Models with Real Physical Systems",
        "Morpheus · arXiv:2504.02918 · 用真实落球、反弹和碰撞实验评估生成视频的牛顿力学。",
        "https://arxiv.org/abs/2504.02918"
      ],
      [
        "How Far is Video Generation from World Model: A Physical Law Perspective",
        "ICML 2025 · arXiv:2411.02385 · 受控物理场景中的泛化研究。",
        "https://arxiv.org/abs/2411.02385"
      ],
      [
        "GEN3C: 3D-Informed World-Consistent Video Generation with Precise Camera Control",
        "CVPR 2025 · arXiv:2503.03751 · 显式三维缓存与相机控制。",
        "https://arxiv.org/abs/2503.03751"
      ],
      [
        "World Labs / Marble",
        "环境生成工具。",
        "https://www.worldlabs.ai/blog/marble-world-model"
      ],
      [
        "ARDY",
        "人物动作模型与项目说明。",
        "https://research.nvidia.com/labs/sil/projects/ardy/"
      ],
      [
        "Higgsfield / 3D Jutsu",
        "官方工作流说明：三维场景、摄影机、动画时间线与视频生成。",
        "https://higgsfield.ai/blog/higgsfield-3d-jutsu"
      ]
    ],
    "demoTitle": "连续身体动作",
    "demoIntro": "下面回放保存的 ARDY 双人动作。暂停查看同一时刻的姿势、站位与接触，再在导演台里调整片段时间和人物位置。",
    "play": "暂停",
    "resume": "播放",
    "restart": "从头播放",
    "demoCaption": "保存的 ARDY 动作回放 · 可暂停与重播。",
    "controlsTitle": "在虚拟片场里",
    "microTitle": "调整表演的细节",
    "microBody": [
      "回看 ARDY 生成的双人动作，浅色人物的第一拳已经接近对方上身，但蓄力与挥出的衔接还显得轻。导演可以在看完后对 Codex 说：把这一拳打得更有力量，蓄力再往后拉一点，挥出去更快。",
      "Codex 将这句话落实为时间线上的修改：把蓄力关键帧里的手部目标往后移，缩短它到出拳姿势之间的时间，再交给 ARDY 按新的姿势与时间约束继续生成。ARDY 支持全身关键帧与关节位置约束。<sup><a href=\"#ref-5\">[5]</a></sup> 下方复用这段保存动作，预演局部修改如何改变第一拳。"
    ],
    "studyCaption": "保存的 ARDY 双人动作 · 第一拳的关键帧预演。页面以关节目标和插值预览调整，ARDY 重新生成可沿用这些姿势与时间约束。",
    "baseline": "原动作",
    "adjusted": "关键帧调整后",
    "height": "手部目标高度",
    "windup": "蓄力后移距离",
    "duration": "挥出时间",
    "reset": "恢复原动作",
    "phases": [
      "蓄力",
      "挥出",
      "到位",
      "收回"
    ],
    "spatialTitle": "在场内取景",
    "spatialBody": "导演也可以进入同一个片场寻找机位。向前移动、转身、抬高或压低视点，构图、透视和前景遮挡随之变化；布景与人物关系仍保留在场景里。我们加入了面向 PICO 的 WebXR 模拟流程，用头显与控制器的空间输入探索 Perspective Camera 的操作，像手持摄影机一样取景，并通过 FOV 调整视野。",
    "physicsTitle": "接触之后的运动",
    "physicsBody": "独立道具配置为动态刚体，人物碰撞体随动作更新，Rapier 按配置计算重力、接触与碰撞响应。导演可以调整人物动作、道具初始状态和物理参数，再从摄影机里查看交互结果。物体的运动在虚拟环境中发生，成为可拍摄的场景过程。",
    "physicsLink": "在导演台中查看道具交互",
    "evidenceTitle": "当前导演台",
    "approachTitle": "技术分工",
    "spatialDetail": "两路画面来自同一个三维场景。采集视角显示 Perspective Camera 的取景结果，第三视角显示戴 PICO 的人在平衡车上移动，以及设备视点与人物的空间关系。页面中的设备轨迹驱动摄影机位姿；改变位置或 FOV，两路画面同步更新。PICO 实机与镜头轨迹录制沿用这一控制方向继续接入。",
    "spatialLink": "查看 WebXR 模拟流程",
    "evaluationTitle": "编辑与复用",
    "nextTitle": "后续工作",
    "captureViews": [
      [
        "采集视角 · Perspective Camera",
        ""
      ],
      [
        "第三视角 · PICO 空间操作",
        ""
      ]
    ],
    "captureCaption": "双视角实时渲染 · 同一场景、同一设备位姿。采集视角显示取景结果，第三视角显示戴 PICO 的人沿路径滑行及摄影机视锥。设备轨迹由页面模拟。",
    "cameraResearch": "GEN3C 将显式三维缓存渲染为指定机位的参考视图，以改善视频生成的摄影机控制与三维一致性。<sup><a href=\"#ref-3\" aria-label=\"Reference 3\">[3]</a></sup> 这也说明，保留场景中的空间信息，可以为生成过程提供具体的取景依据。",
    "physicsResearch": [
      "物体落下的轨迹、撞到表面后的反弹、接触之后的运动，都会影响一场戏的因果关系。Morpheus 用真实的落球、反弹和碰撞实验评估生成视频，发现所评估模型的运动仍有牛顿力学偏差。<sup><a href=\"#ref-1\" aria-label=\"Reference 1\">[1]</a></sup>",
      "How Far is Video Generation from World Model 在受控运动与碰撞任务中发现，模型在训练分布内表现较好，面对分布外条件时仍难以稳定遵循物理规律。<sup><a href=\"#ref-2\" aria-label=\"Reference 2\">[2]</a></sup> 导演台可以把重力、质量、摩擦与碰撞条件直接放进场景，让这些行为拥有可编辑的来源。"
    ],
    "capturePosition": "沿路径移动",
    "captureFov": "摄影机 FOV",
    "instructionLabel": "给 Codex 的修改指令",
    "editInstruction": "这段动作的第一拳，蓄力再往后拉一点，出拳更快。保留人物站位和出拳到达的位置。",
    "applyEdit": "预演这次修改",
    "editOriginal": "先回看原动作，再应用这次调整。",
    "editApplied": "蓄力目标后移 18 cm，挥出时间从 300 ms 缩短到 150 ms。",
    "editUnavailable": "保存动作暂时无法加载。",
    "firstPunch": "第一拳的时间线",
    "fullTake": "回看完整双人动作"
  },
  "en": {
    "title": "Scenra — Director workspace",
    "description": "Project proposal combining World Labs, Tripo, ARDY and Rapier for finer directing control in video generation.",
    "skip": "Skip to content",
    "kind": "PROJECT PROPOSAL / WORKING PROTOTYPE",
    "heading": "Scenra director workspace",
    "subtitle": "Environment, motion, physics and camera controls for AI video directing.",
    "meta": "TRIPOTHON S1 · World Labs / Tripo / ARDY / Rapier",
    "abstractTitle": "Abstract",
    "abstract": [
      "Director workspaces are familiar parts of AI video creation: LLMs organize scenes, 3D tools such as Blender arrange actors and cameras, Perspective Camera captures footage, and video models use it as reference. Higgsfield demonstrates related scene-to-reference workflow.<sup><a href=\"#ref-6\">[6]</a></sup>",
      "Detailed performances need further capabilities. LLM-led motion sequencing, scene decomposition and asset construction can leave stiff movement and incomplete interactions. Rough blockouts therefore communicate composition and blocking while video models fill in performance. Scenra combines World Labs environments, Tripo props, ARDY motion and Rapier physics to bring these details into director workspace.",
      "This makes finer control possible: actor pose and motion use explicit spatial and temporal parameters, cameras frame shared virtual set, and prop movement follows contact and physical state. WebXR simulation for PICO workflows explores Perspective Camera control through spatial input, like moving and aiming handheld camera."
    ],
    "launch": "View working prototype",
    "repo": "Project repository",
    "contentsTitle": "Contents",
    "loading": "Loading figure…",
    "sections": [
      [
        "question",
        "From framing to performance"
      ],
      [
        "approach",
        "Technical roles"
      ],
      [
        "controls",
        "Inside virtual set"
      ],
      [
        "evaluation",
        "Editing and reuse"
      ],
      [
        "next",
        "Further work"
      ]
    ],
    "question": [
      "3D scenes provide explicit references for video generation. Actor placement, camera direction and foreground occlusion can be arranged before rendering. Higgsfield 3D Jutsu connects scenes, animation timelines and cameras with video generation: export blockout footage, then combine it with actor and environment references.<sup><a href=\"#ref-6\">[6]</a></sup>",
      "After composition and blocking comes performance. Arm movement needs continuous body motion, collisions need correct contact timing, and pushed props need physical response. LLM-generated scenes provide starting points; motion sequencing, interactive-object decomposition and asset construction need their own capabilities. Added scene detail makes these components matter directly to reference quality.",
      "Rough blockouts reduce authoring work and communicate spatial intent while video models supply performance detail. We explore detailed director workspace instead, combining environment, asset, motion and physics tools so performances and interactions run in virtual scene before camera capture."
    ],
    "background": [
      "Video models learn motion and interaction from visual data. Morpheus uses real falling-ball, rebound and projectile experiments, extracts generated trajectories, and evaluates dynamics and physical invariants. Evaluated models still produce physical-law violations.<sup><a href=\"#ref-1\" aria-label=\"Reference 1\">[1]</a></sup>",
      "How Far is Video Generation from World Model studies physical generalization through controlled 2D motion and collision experiments. Models perform well within training distributions but fail in out-of-distribution cases. This supports explicit trajectory and collision checks alongside visual assessment.<sup><a href=\"#ref-2\" aria-label=\"Reference 2\">[2]</a></sup>",
      "GEN3C uses explicit 3D cache and rendered views under specified camera trajectories to improve camera control and 3D consistency.<sup><a href=\"#ref-3\" aria-label=\"Reference 3\">[3]</a></sup> Scenra follows explicit-scene reference construction, currently exporting WebM. How video models use these references needs evaluation."
    ],
    "approach": [
      "Scenra separates environment generation, prop modeling, character motion and physical simulation, then combines outputs in shared scene. World Labs supplies environments, Tripo independent props, ARDY character motion and Rapier rigid-body gravity and collisions. LLMs can organize directing intent; specialized tools turn it into editable scene state.",
      "Integration aligns actor and prop coordinates, maps motion to tracks, updates body colliders with movement, computes prop response and records footage through Perspective Camera. Improving models can supply better environments, assets and motion within same controls."
    ],
    "tools": [
      [
        "World Labs",
        "Build 3D environments from scene images."
      ],
      [
        "Tripo",
        "Generate independent GLB props from reference images."
      ],
      [
        "Stageon / ARDY",
        "Supply saved motion and character skin for actor tracks."
      ],
      [
        "Three.js / Rapier",
        "Render scenes and simulate configured rigid-body gravity and collisions."
      ]
    ],
    "sceneCaption": "Camera illustration · Slide past column to reveal actors, showing how viewpoint changes framing and occlusion.",
    "motionTitle": "Motion, contact and replay",
    "motion": [
      "Actors replay saved ARDY motion on independent tracks. Clip timing, position and heading can be adjusted. Continuous motion supplies body movement; foot contact, actor contact and prop coordination still need checks and corrections per scene.",
      "Rapier runs dynamic props with configured gravity and collision parameters. Kinematic character colliders can push props. Current interaction covers rigid-body collisions. Precise grasping, attachment and complete contact constraints remain pending.",
      "Saved character motion supports replay and reframing. Frame-by-frame physics replay requires recorded or restored physical state; complete physics-state recording remains unavailable."
    ],
    "motionCaption": "Figure 2 · Two-actor fight using saved ARDY motion. Figure illustrates motion source and synchronized playback.",
    "prototype": [
      "Bundled courtyard combines independent props, saved motion, actor tracks, rigid-body interaction and canvas recording. Generated environments and props remain editable; actor motion supports replay and cameras support reframing."
    ],
    "capabilities": [
      "Set layout: move, rotate and scale independent props; configure static or dynamic physics; grab and release through interface.",
      "Actors: edit independent motion tracks, clip timing, placement and heading; play, pause and scrub timeline.",
      "Camera: move, pan, rotate and adjust FOV; inspect occlusion and composition.",
      "Output: record canvas and download WebM. Floating interface controls stay outside recorded canvas."
    ],
    "workflow": "Workflow: Perspective Camera → Edit Scene → Objects / Actors → Save & Preview → record WebM.",
    "editorLink": "Open scene editor",
    "materialNames": [
      "Courtyard input",
      "Bench reference",
      "Table reference",
      "Incense burner reference"
    ],
    "materialNote": "Figure 3 · Scene input and prop references. World Labs builds environment; prop references feed Tripo model generation.",
    "evaluationIntro": [
      "Actors, props and cameras remain within shared scene state. Review, revise and reshoot after each edit; existing sets, motion and camera arrangements support further scenes."
    ],
    "evaluation": [
      [
        "Explicit edit targets",
        "Hand targets, clip timing, prop placement and camera orientation refer to existing state. Adjust decisions individually and inspect recorded view."
      ],
      [
        "Reusable assets and performances",
        "Keep environments and actor relationships while replacing props or clips. Reusable assets, motion and camera arrangements accumulate through continued work."
      ],
      [
        "Improving models within same workflow",
        "Better environment, asset and motion models can supply improved content. Scene state retains space, time and physics while cameras capture it."
      ]
    ],
    "evaluationEnd": [
      "We aim for performances and interactions to occur within virtual set, then record them through cameras. Directors revise and reshoot editable scenes; video models continue supplying visual style and image treatment."
    ],
    "next": [
      "Connect joint targets, speed and contact constraints to actor tracks. Add grasping, attachment and physics-state recording so movement and interaction can be saved, edited and replayed together.",
      "Continue physical PICO integration and camera-trajectory recording. Consider Jupyter S2 for shared spatial monitoring of actor spacing, foreground occlusion and shot depth."
    ],
    "hardwareTitle": "Spatial monitoring concept",
    "hardware": [
      "Jupyter S2 is considered for shared spatial monitoring, following familiar director-and-crew review. Concept layout shows monitor placement; device integration follows separately."
    ],
    "photoCaption": "AI-generated set concept · Proposed spatial monitoring placement.",
    "layoutLink": "View concept layout",
    "referencesTitle": "References and tools",
    "references": [
      [
        "Evaluating Newtonian Mechanics in Video Generative Models with Real Physical Systems",
        "Morpheus · arXiv:2504.02918 · Newtonian mechanics evaluation using real falling, bouncing and collision experiments.",
        "https://arxiv.org/abs/2504.02918"
      ],
      [
        "How Far is Video Generation from World Model: A Physical Law Perspective",
        "ICML 2025 · arXiv:2411.02385 · Physical generalization in controlled experiments.",
        "https://arxiv.org/abs/2411.02385"
      ],
      [
        "GEN3C: 3D-Informed World-Consistent Video Generation with Precise Camera Control",
        "CVPR 2025 · arXiv:2503.03751 · Explicit 3D cache and camera control.",
        "https://arxiv.org/abs/2503.03751"
      ],
      [
        "World Labs / Marble",
        "Environment generation tool.",
        "https://www.worldlabs.ai/blog/marble-world-model"
      ],
      [
        "ARDY",
        "Character motion model and project details.",
        "https://research.nvidia.com/labs/sil/projects/ardy/"
      ],
      [
        "Higgsfield / 3D Jutsu",
        "Official workflow description: 3D scenes, cameras, animation timeline and video generation.",
        "https://higgsfield.ai/blog/higgsfield-3d-jutsu"
      ]
    ],
    "demoTitle": "Continuous body motion",
    "demoIntro": "Replay saved two-actor ARDY motion. Pause to inspect poses, blocking and contact, then edit clip timing and actor placement in director workspace.",
    "play": "Pause",
    "resume": "Play",
    "restart": "Replay",
    "demoCaption": "Saved ARDY motion · Pause and replay available.",
    "controlsTitle": "Inside virtual set",
    "microTitle": "Refining performance",
    "microBody": [
      "Review saved two-actor ARDY motion. Light-colored actor brings first punch close to opponent’s upper body, but windup-to-strike transition feels light. Director can ask Codex to make this punch feel stronger: pull farther back before striking and send fist forward faster.",
      "Codex turns this direction into timeline edits: move hand target back at windup keyframe, shorten time to strike pose, then pass updated pose and timing constraints to ARDY for continued generation. ARDY supports full-body keyframes and joint-position constraints.<sup><a href=\"#ref-5\">[5]</a></sup> Preview below reuses saved motion to show local edits to first punch."
    ],
    "studyCaption": "Saved two-actor ARDY motion · First-punch keyframe preview. Joint targets and interpolation preview edits; ARDY regeneration can use corresponding pose and timing constraints.",
    "baseline": "Original motion",
    "adjusted": "Keyframe edit",
    "height": "Hand target height",
    "windup": "Additional windup",
    "duration": "Strike duration",
    "reset": "Restore original motion",
    "phases": [
      "Windup",
      "Strike",
      "Arrive",
      "Recover"
    ],
    "spatialTitle": "Finding viewpoint",
    "spatialBody": "Directors can enter shared set to find viewpoints. Moving forward, turning, raising or lowering viewpoint changes framing, perspective and foreground occlusion while staging and actor relationships remain in scene. WebXR simulation for PICO workflows explores Perspective Camera operation through headset and controller input, like handheld filming, with FOV adjusting field of view.",
    "physicsTitle": "Motion after contact",
    "physicsBody": "Independent props become dynamic rigid bodies, character colliders follow motion and Rapier computes configured gravity, contact and collision response. Edit actor motion, initial prop state and physics parameters, then review interaction through camera. Object movement happens within virtual environment as recordable scene activity.",
    "physicsLink": "Inspect prop interaction in director workspace",
    "evidenceTitle": "Current director workspace",
    "approachTitle": "Technical roles",
    "spatialDetail": "Both views render shared 3D scene. Capture view shows Perspective Camera framing; third-person view shows PICO wearer moving on hoverboard and viewpoint relative to actors. Simulated device trajectory drives camera pose; position or FOV changes update both views together. Physical PICO integration and camera trajectory recording follow this control direction.",
    "spatialLink": "View WebXR simulation flow",
    "evaluationTitle": "Editing and reuse",
    "nextTitle": "Further work",
    "captureViews": [
      [
        "Capture view · Perspective Camera",
        ""
      ],
      [
        "Third-person view · PICO operation",
        ""
      ]
    ],
    "captureCaption": "Live paired rendering · Shared scene and device pose. Capture view shows framing; observer view shows PICO wearer moving along path and camera frustum. Device trajectory is simulated on page.",
    "cameraResearch": "GEN3C renders explicit 3D cache from requested viewpoints to guide video generation, improving camera control and 3D consistency.<sup><a href=\"#ref-3\" aria-label=\"Reference 3\">[3]</a></sup> Retained scene geometry gives generation concrete viewpoint references.",
    "physicsResearch": [
      "Falling trajectories, surface rebounds and movement after contact affect causality within performance. Morpheus evaluates generated video against real falling, bouncing and collision experiments; assessed models still show deviations from Newtonian mechanics.<sup><a href=\"#ref-1\" aria-label=\"Reference 1\">[1]</a></sup>",
      "How Far is Video Generation from World Model finds better performance within training distribution than under unseen motion and collision conditions.<sup><a href=\"#ref-2\" aria-label=\"Reference 2\">[2]</a></sup> Director workspace can encode gravity, mass, friction and collision settings directly in scene, giving these behaviors editable causes."
    ],
    "capturePosition": "Move along path",
    "captureFov": "Camera FOV",
    "instructionLabel": "Direction for Codex",
    "editInstruction": "Pull farther back before first punch and strike faster. Preserve actor placement and strike target.",
    "applyEdit": "Preview this edit",
    "editOriginal": "Review original motion, then apply this adjustment.",
    "editApplied": "Windup target moves back 18 cm; strike duration changes from 300 ms to 150 ms.",
    "editUnavailable": "Saved motion could not load.",
    "firstPunch": "First-punch timeline",
    "fullTake": "Replay full two-actor take"
  }
};
