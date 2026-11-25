extends Node3D

const BLOCKS := 7
const SPACING := 78.0
const ROAD := 18.0
const HALF_CITY := BLOCKS * SPACING * 0.5

var car: CharacterBody3D
var cam: Camera3D
var hud: CanvasLayer
var mission_idx := 0
var cash := 250
var wanted := 0.0
var clock := 21.0
var msg := ""
var msg_left := 0.0
var targets: Array[Vector3] = []
var target_mesh: MeshInstance3D
var cops: Array[CharacterBody3D] = []
var traffic: Array[Node3D] = []
var rng := RandomNumberGenerator.new()
var materials: Dictionary = {}
var last_car_pos := Vector3.ZERO
var hit_cooldown := 0.0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	rng.seed = 72026
	_setup_input()
	_setup_environment()
	_build_city()
	_build_missions()
	_build_car()
	_build_traffic()
	_build_hud()
	last_car_pos = car.global_position
	show_message("WELCOME TO SAN MARINO. THE NIGHT SHIFT IS YOURS.", 4.5)

func _setup_input() -> void:
	for pair in [["accelerate", KEY_W], ["reverse", KEY_S], ["left", KEY_A], ["right", KEY_D], ["handbrake", KEY_SPACE], ["mission", KEY_E], ["pause_game", KEY_ESCAPE]]:
		if not InputMap.has_action(pair[0]): InputMap.add_action(pair[0])
		var ev := InputEventKey.new(); ev.physical_keycode = pair[1]; InputMap.action_add_event(pair[0], ev)
	for pair in [["accelerate", KEY_UP], ["reverse", KEY_DOWN], ["left", KEY_LEFT], ["right", KEY_RIGHT]]:
		var ev := InputEventKey.new(); ev.physical_keycode = pair[1]; InputMap.action_add_event(pair[0], ev)

func _setup_environment() -> void:
	var world := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new(); var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color("111a31"); sky_mat.sky_horizon_color = Color("bb6e61")
	sky_mat.ground_bottom_color = Color("11151d"); sky_mat.ground_horizon_color = Color("3f3948")
	sky.sky_material = sky_mat; env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("8698bb"); env.ambient_light_energy = 0.45
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.glow_enabled = true; env.glow_intensity = 0.32
	env.fog_enabled = true; env.fog_light_color = Color("7d5964"); env.fog_density = 0.0017
	world.environment = env; add_child(world)
	var sun := DirectionalLight3D.new(); sun.rotation_degrees = Vector3(-38, -26, 0)
	sun.light_color = Color("f8b98a"); sun.light_energy = 0.75; sun.shadow_enabled = true; add_child(sun)
	var fill := OmniLight3D.new(); fill.position = Vector3(0, 22, 0); fill.omni_range = 130; fill.light_energy = 0.55; fill.light_color = Color("6296ff"); add_child(fill)

func _mat(key: String, color: Color, rough := 0.86, metallic := 0.0, emission := Color.BLACK) -> StandardMaterial3D:
	if materials.has(key): return materials[key]
	var m := StandardMaterial3D.new(); m.albedo_color = color; m.roughness = rough; m.metallic = metallic
	if emission != Color.BLACK: m.emission_enabled = true; m.emission = emission; m.emission_energy_multiplier = 1.3
	materials[key] = m; return m

func _box(parent: Node3D, name: String, pos: Vector3, size: Vector3, material: Material, collision := false) -> MeshInstance3D:
	var mesh := BoxMesh.new(); mesh.size = size
	var instance := MeshInstance3D.new(); instance.name = name; instance.mesh = mesh; instance.material_override = material; instance.position = pos; parent.add_child(instance)
	if collision:
		var body := StaticBody3D.new(); body.name = name + "Collision"; body.position = pos; parent.add_child(body)
		var shape := CollisionShape3D.new(); var box := BoxShape3D.new(); box.size = size; shape.shape = box; body.add_child(shape)
	return instance

func _build_city() -> void:
	var ground_mat := _mat("ground", Color("27363d"))
	var road_mat := _mat("asphalt", Color("20262d"), 0.98)
	var sidewalk_mat := _mat("walk", Color("74777a"))
	var line_mat := _mat("line", Color("dbd3ad"), 0.5)
	_box(self, "IslandBase", Vector3(0,-1.5,0), Vector3(HALF_CITY*2+95, 3, HALF_CITY*2+95), ground_mat, true)
	# Broad avenues and neighborhood streets form a navigable 7 x 7 district grid.
	for i in range(BLOCKS+1):
		var p := -HALF_CITY + i * SPACING
		_box(self, "RoadNS_%d" % i, Vector3(p,0.03,0), Vector3(ROAD,0.06,HALF_CITY*2+55), road_mat)
		_box(self, "RoadEW_%d" % i, Vector3(0,0.031,p), Vector3(HALF_CITY*2+55,0.06,ROAD), road_mat)
		_box(self, "SidewalkNSL_%d" % i, Vector3(p-ROAD*0.59,0.11,0), Vector3(3.0,0.17,HALF_CITY*2+55), sidewalk_mat)
		_box(self, "SidewalkNSR_%d" % i, Vector3(p+ROAD*0.59,0.11,0), Vector3(3.0,0.17,HALF_CITY*2+55), sidewalk_mat)
		_box(self, "SidewalkEWL_%d" % i, Vector3(0,0.11,p-ROAD*0.59), Vector3(HALF_CITY*2+55,0.17,3.0), sidewalk_mat)
		_box(self, "SidewalkEWR_%d" % i, Vector3(0,0.11,p+ROAD*0.59), Vector3(HALF_CITY*2+55,0.17,3.0), sidewalk_mat)
		for j in range(-BLOCKS, BLOCKS+1):
			var z := j * 11.0
			_box(self, "DashNS_%d_%d" % [i,j], Vector3(p,0.075,z), Vector3(0.22,0.025,4.2), line_mat)
			_box(self, "DashEW_%d_%d" % [i,j], Vector3(z,0.076,p), Vector3(4.2,0.025,0.22), line_mat)
	# City blocks: varied footprints, heights, roof shapes, lit windows, signs and planted courtyards.
	var facades := [Color("596b72"),Color("b87c68"),Color("9a927e"),Color("657283"),Color("c1a987"),Color("667a71"),Color("846e79")]
	var glass := _mat("windows", Color("ffd98a"),0.27,0.1,Color("e7a34b"))
	for bx in range(BLOCKS):
		for bz in range(BLOCKS):
			var cx := -HALF_CITY + (bx+0.5)*SPACING
			var cz := -HALF_CITY + (bz+0.5)*SPACING
			if bx == 3 and bz == 3:
				_build_plaza(Vector3(cx,0,cz)); continue
			if bx == 0 and bz > 3:
				_build_park(Vector3(cx,0,cz)); continue
			var count := rng.randi_range(2,4)
			for k in range(count):
				var px := cx + rng.randf_range(-21,21); var pz := cz + rng.randf_range(-21,21)
				var sx := rng.randf_range(12,20); var sz := rng.randf_range(12,20)
				var height := rng.randf_range(15,40)
				if bx in [2,3,4] and bz in [2,3,4]: height *= rng.randf_range(1.25,1.8)
				var facade := _mat("facade_%d" % ((bx*3+bz+k)%facades.size()),facades[(bx*3+bz+k)%facades.size()])
				_box(self,"Building_%d_%d_%d"%[bx,bz,k],Vector3(px,height*0.5,pz),Vector3(sx,height,sz),facade,true)
				_box(self,"Roof_%d_%d_%d"%[bx,bz,k],Vector3(px,height+0.15,pz),Vector3(sx+0.5,0.35,sz+0.5),_mat("roof",Color("353b43")))
				# Neon roof signs and a rooftop service structure make the skyline readable from a distance.
				if height > 30 and rng.randf() < 0.55:
					var neon := _mat("neon_%d"%k,[Color("3ce6d2"),Color("f18eb4"),Color("ffbf66")][k%3],0.38,0.0,[Color("3ce6d2"),Color("f18eb4"),Color("ffbf66")][k%3])
					_box(self,"NeonSign_%d_%d_%d"%[bx,bz,k],Vector3(px,height*0.72,pz-sz*0.5-0.16),Vector3(sx*0.62,1.5,0.25),neon)
				if rng.randf() < 0.28:
					_box(self,"HVAC_%d_%d_%d"%[bx,bz,k],Vector3(px+sx*0.25,height+0.8,pz),Vector3(3,1.1,2.5),_mat("hvac",Color("777c7e")))
				_add_window_bands(px,pz,sx,sz,height,glass,bx,bz,k)
	# Street lights, palms and benches add scale and warm pools of light.
	for x in range(BLOCKS+1):
		for z in range(BLOCKS+1):
			var px := -HALF_CITY+x*SPACING; var pz := -HALF_CITY+z*SPACING
			for sign in [-1,1]:
				var lx: float = px + float(sign)*(ROAD*0.5+2.2)
				_build_lamp(Vector3(lx,0,pz+3.3))
	
func _add_window_bands(x: float,z: float,sx: float,sz: float,h: float,glass: Material,bx:int,bz:int,k:int) -> void:
	# Sparse grouped window strips: enough facade rhythm without expensive per-window geometry.
	var floors := int(h/4.2)
	for f in range(min(floors,8)):
		var y := 3.4+f*4.15
		if y>h-1.4: break
		_box(self,"WindowBand_%d_%d_%d_%d"%[bx,bz,k,f],Vector3(x,y,z-sz*0.5-0.025),Vector3(sx*0.72,1.15,0.05),glass)
		_box(self,"WindowBandR_%d_%d_%d_%d"%[bx,bz,k,f],Vector3(x+sx*0.5+0.025,y,z),Vector3(0.05,1.15,sz*0.72),glass)

func _build_lamp(p: Vector3) -> void:
	var pole := _mat("lamp_pole",Color("333b43"),0.4,0.7)
	var head := _mat("lamp_glow",Color("ffd991"),0.25,0.0,Color("ffbf72"))
	_box(self,"StreetLampPole",p+Vector3(0,4.1,0),Vector3(0.2,8.2,0.2),pole)
	_box(self,"StreetLampHead",p+Vector3(0,8.25,0),Vector3(1.0,0.25,0.45),head)
	var light := OmniLight3D.new(); light.position=p+Vector3(0,7.9,0); light.omni_range=15; light.light_energy=0.48; light.light_color=Color("ffc883"); add_child(light)

func _build_plaza(p: Vector3) -> void:
	_box(self,"CentralPlaza",p+Vector3(0,0.2,0),Vector3(48,0.4,48),_mat("plaza",Color("8b8580")))
	_box(self,"FountainBase",p+Vector3(0,0.55,0),Vector3(14,0.7,14),_mat("fountain",Color("556c76"),0.25,0.3))
	var water := _mat("water",Color("41a7bd",0.78),0.18,0.25,Color("1b7189"))
	_box(self,"FountainWater",p+Vector3(0,0.94,0),Vector3(12.4,0.12,12.4),water)
	for i in range(8):
		var a := TAU*i/8.0; _build_tree(p+Vector3(cos(a)*19,0,sin(a)*19),true)
	for i in range(4):
		var a := TAU*i/4.0; _box(self,"PlazaBench",p+Vector3(cos(a)*10,0.65,sin(a)*10),Vector3(3.4,0.35,0.75),_mat("bench",Color("57463c")))

func _build_park(p: Vector3) -> void:
	_box(self,"BayfrontPark",p+Vector3(0,0.05,0),Vector3(58,0.1,58),_mat("grass",Color("466750")))
	for i in range(18):
		var t := Vector3(rng.randf_range(-24,24),0,rng.randf_range(-24,24)); _build_tree(p+t,false)
	_box(self,"ParkPath",p+Vector3(0,0.15,0),Vector3(3,0.12,54),_mat("path",Color("b9ac90")))

func _build_tree(p:Vector3, plaza:bool) -> void:
	_box(self,"PalmTrunk",p+Vector3(0,3.0,0),Vector3(0.7,6.0,0.7),_mat("trunk",Color("806148")))
	for i in range(5):
		var a:=TAU*i/5.0; var fr:=_box(self,"PalmFrond",p+Vector3(cos(a)*1.7,6.3+sin(i*3.0)*0.45,sin(a)*1.7),Vector3(3.8,0.18,0.65),_mat("leaf",Color("4b865e")))
		fr.rotation.y = -a

func _build_missions() -> void:
	targets = [Vector3(-117,0,117),Vector3(117,0,39),Vector3(195,0,-195),Vector3(-195,0,-117),Vector3(39,0,195)]
	target_mesh = MeshInstance3D.new(); target_mesh.name="ObjectiveBeacon"
	var torus:=TorusMesh.new(); torus.inner_radius=3.2; torus.outer_radius=3.6; target_mesh.mesh=torus
	target_mesh.material_override=_mat("objective",Color("40e7d2"),0.25,0.0,Color("40e7d2")); target_mesh.position=targets[0]+Vector3(0,0.5,0); add_child(target_mesh)
	var pillar:=CylinderMesh.new(); pillar.top_radius=0.5; pillar.bottom_radius=0.5; pillar.height=8
	var beam:=MeshInstance3D.new(); beam.mesh=pillar; beam.material_override=_mat("beam",Color("40e7d2",0.27),0.1,0.0,Color("40e7d2")); beam.position=targets[0]+Vector3(0,4,0); add_child(beam); beam.name="ObjectiveBeam"

func _build_car() -> void:
	car=CharacterBody3D.new(); car.name="PlayerCar"; car.position=Vector3(0,0.8,HALF_CITY-10); add_child(car)
	car.process_mode = Node.PROCESS_MODE_PAUSABLE
	car.set_script(preload("res://vehicle.gd")); car.setup(self)
	var shape:=CollisionShape3D.new(); var box:=BoxShape3D.new(); box.size=Vector3(2.1,1.1,4.4); shape.shape=box; shape.position.y=0.25; car.add_child(shape)
	var body:=_box(car,"CoupeBody",Vector3(0,0.35,0),Vector3(2.05,0.72,4.25),_mat("car_paint",Color("b54838"),0.26,0.62))
	var cabin:=_box(car,"CoupeCabin",Vector3(0,1.03,-0.25),Vector3(1.5,0.82,1.95),_mat("car_glass",Color("182932"),0.18,0.45))
	_box(car,"Hood",Vector3(0,0.78,-1.48),Vector3(1.88,0.16,1.1),_mat("car_paint",Color("b54838"),0.26,0.62))
	_box(car,"FrontGlass",Vector3(0,1.15,-0.9),Vector3(1.36,0.48,0.055),_mat("glass",Color("8ea5aa"),0.12,0.2))
	for x in [-1.02,1.02]:
		for z in [-1.4,1.42]:
			var wheel:=MeshInstance3D.new(); var cyl:=CylinderMesh.new(); cyl.top_radius=0.43;cyl.bottom_radius=0.43;cyl.height=0.27;wheel.mesh=cyl;wheel.material_override=_mat("rubber",Color("14191d"),0.88);wheel.position=Vector3(x,0.05,z);wheel.rotation.z=PI/2;car.add_child(wheel)
	for x in [-0.66,0.66]:
		var lamp:=_box(car,"Headlight",Vector3(x,0.48,-2.14),Vector3(0.42,0.2,0.08),_mat("headlight",Color("fff0bd"),0.18,0.0,Color("ffe3a1")))
		var hl:=SpotLight3D.new();hl.position=Vector3(x,0.55,-2.15);hl.rotation.x=deg_to_rad(-10);hl.spot_range=28;hl.spot_angle=27;hl.light_energy=1.0;hl.light_color=Color("ffe4b0");car.add_child(hl)
	cam=Camera3D.new(); cam.name="ChaseCamera";cam.current=true;cam.fov=73;add_child(cam);cam.position=Vector3(0,7,12);cam.look_at(car.global_position)

func _build_traffic() -> void:
	for i in range(15):
		var t:=Node3D.new();t.name="Traffic_%02d"%i;add_child(t)
		var axis:=rng.randi_range(0,1);var lane:=rng.randi_range(-3,3)*SPACING;var dir:=rng.randi_range(0,1)
		t.set_meta("axis",axis);t.set_meta("lane",lane);t.set_meta("direction",dir);t.set_meta("speed",rng.randf_range(5.5,10.0));t.set_meta("phase",rng.randf_range(-HALF_CITY,HALF_CITY))
		var paint:=_mat("traffic_%d"%i,[Color("d5d0c2"),Color("416b80"),Color("cf9b56"),Color("556c5a"),Color("c1c5c8")][i%5],0.28,0.5)
		_box(t,"TrafficBody",Vector3(0,0.6,0),Vector3(1.8,0.6,3.6),paint)
		_box(t,"TrafficCabin",Vector3(0,1.05,-0.15),Vector3(1.35,0.55,1.5),_mat("traffic_glass",Color("273944"),0.17,0.3))
		traffic.append(t)

func _build_police() -> CharacterBody3D:
	var cop:=CharacterBody3D.new();cop.name="PursuitUnit";add_child(cop)
	var shape:=CollisionShape3D.new();var box:=BoxShape3D.new();box.size=Vector3(2,1,4);shape.shape=box;shape.position.y=0.25;cop.add_child(shape)
	_box(cop,"PoliceBody",Vector3(0,0.35,0),Vector3(1.9,0.72,4),_mat("police_paint",Color("e7e8e4"),0.24,0.55))
	_box(cop,"PoliceDoors",Vector3(0,0.52,0),Vector3(1.94,0.34,1.5),_mat("police_blue",Color("253d59"),0.26,0.45))
	_box(cop,"Lightbar",Vector3(0,1.12,0),Vector3(0.9,0.16,0.32),_mat("lightbar",Color("e94f56"),0.23,0,Color("f43e4c")))
	cops.append(cop);return cop

func _build_hud() -> void:
	hud=CanvasLayer.new();hud.layer=5;add_child(hud);hud.set_script(preload("res://hud.gd"));hud.setup(self)

func _process(delta:float) -> void:
	clock=fposmod(clock+delta*0.012,24.0)
	if msg_left>0: msg_left-=delta
	if hit_cooldown>0:hit_cooldown-=delta
	if is_instance_valid(car):
		var desired:=car.global_position+car.global_transform.basis.z*13.5+Vector3.UP*6.2
		cam.global_position=cam.global_position.lerp(desired,1.0-exp(-delta*4.2));cam.look_at(car.global_position+Vector3(0,0.9,0))
		target_mesh.position=targets[mission_idx]+Vector3(0,0.4+sin(Time.get_ticks_msec()*0.002)*0.35,0)
		var beam:=get_node_or_null("ObjectiveBeam")
		if beam:beam.position=targets[mission_idx]+Vector3(0,4,0)
		_update_traffic(delta)
		_update_wanted(delta)
		if car.global_position.distance_to(last_car_pos)>7.5 and hit_cooldown<=0:
			if car.get_last_slide_collision()!=null:
				wanted=min(5.0,wanted+0.28);hit_cooldown=0.8
		last_car_pos=car.global_position
		if Input.is_action_just_pressed("mission"): _try_mission()
		if Input.is_action_just_pressed("pause_game"): _toggle_pause()

func _update_traffic(delta:float) -> void:
	for t in traffic:
		var axis:int=t.get_meta("axis");var phase:float=t.get_meta("phase")+t.get_meta("speed")*delta*(1 if t.get_meta("direction")==0 else -1)
		if phase>HALF_CITY+20:phase=-HALF_CITY-20
		if phase< -HALF_CITY-20:phase=HALF_CITY+20
		t.set_meta("phase",phase);var lane:float=t.get_meta("lane")
		if axis==0:t.position=Vector3(lane,0.2,phase);t.rotation.y=PI if t.get_meta("direction")==0 else 0
		else:t.position=Vector3(phase,0.2,lane);t.rotation.y=PI/2 if t.get_meta("direction")==0 else -PI/2

func _update_wanted(delta:float) -> void:
	if wanted<=0:
		for c in cops:c.queue_free()
		cops.clear();return
	if cops.size()<ceil(wanted/1.8) and rng.randf()<delta*0.22:
		var c:=_build_police();var a:=rng.randf_range(0,TAU);c.global_position=car.global_position+Vector3(cos(a),0,sin(a))*55
	for c in cops:
		if not is_instance_valid(c):continue
		var to_player=car.global_position-c.global_position;to_player.y=0
		var desired: Vector3 = to_player.normalized();var vel: Vector3 = desired*(8.5+wanted*1.6)
		c.velocity.x=move_toward(c.velocity.x,vel.x,delta*12);c.velocity.z=move_toward(c.velocity.z,vel.z,delta*12)
		c.move_and_slide();c.look_at(Vector3(car.global_position.x,c.global_position.y,car.global_position.z))
		if to_player.length()<5 and hit_cooldown<=0:
			cash=max(0,cash-100);wanted=max(0,wanted-1);hit_cooldown=2.0;show_message("POLICE STOPPED YOU  •  $100 FINE",2.6)
	if cops.is_empty() and wanted>0:wanted=max(0,wanted-delta*0.025)

func _try_mission() -> void:
	if car.global_position.distance_to(targets[mission_idx])>9:
		show_message("GET CLOSER TO THE MARKER",1.6);return
	var rewards:=[450,650,900,1250,1600];cash+=rewards[mission_idx]
	wanted=min(5.0,wanted+([0.7,1.0,1.2,1.4,1.8][mission_idx]))
	mission_idx=(mission_idx+1)%targets.size();show_message("DELIVERY COMPLETE  •  +$%d"%rewards[(mission_idx-1+targets.size())%targets.size()],3.0)

func show_message(text:String,duration:=2.4) -> void:
	msg=text;msg_left=duration

func mission_name() -> String:
	return ["THE LAST-MINUTE PARCEL","A QUIET PICKUP","BAYFRONT RUN","NIGHT MARKET DROP","ONE MORE FAVOR"][mission_idx]

func mission_hint() -> String:
	return "Drive to the marked spot and press E to complete the delivery. Every run pays better, but raises police attention."

func _toggle_pause() -> void:
	get_tree().paused=not get_tree().paused
	if hud:hud.set_pause_visible(get_tree().paused)

