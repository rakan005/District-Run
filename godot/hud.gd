extends CanvasLayer

var game:Node3D
var pause_overlay:ColorRect
var panel:PanelContainer
var font:Font = ThemeDB.fallback_font

func setup(owner_game:Node3D) -> void:
	game=owner_game
	var root:=Control.new();root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);add_child(root)
	var theme:=Theme.new();theme.default_font_size=16;root.theme=theme
	var top:=HBoxContainer.new();top.position=Vector2(38,32);top.add_theme_constant_override("separation",18);root.add_child(top)
	var brand:=Label.new();brand.text="NIGHTSHIFT";brand.add_theme_font_size_override("font_size",25);brand.add_theme_color_override("font_color",Color("e6f1ee"));top.add_child(brand)
	var sub:=Label.new();sub.text="  /  DISTRICT RUN";sub.add_theme_color_override("font_color",Color("64d9c9"));sub.add_theme_font_size_override("font_size",17);top.add_child(sub)
	var right:=VBoxContainer.new();right.set_anchors_preset(Control.PRESET_TOP_RIGHT);right.position=Vector2(-250,34);right.size=Vector2(210,70);root.add_child(right)
	var money:=Label.new();money.name="Money";money.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT;money.add_theme_font_size_override("font_size",22);money.add_theme_color_override("font_color",Color("f4d68c"));right.add_child(money)
	var heat:=Label.new();heat.name="Heat";heat.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT;heat.add_theme_color_override("font_color",Color("ff806c"));right.add_child(heat)
	panel=PanelContainer.new();panel.position=Vector2(38,112);panel.custom_minimum_size=Vector2(340,136);root.add_child(panel)
	var style:=StyleBoxFlat.new();style.bg_color=Color(0.035,0.065,0.09,0.78);style.border_color=Color(0.25,0.85,0.78,0.8);style.set_border_width(SIDE_LEFT,3);style.set_corner_radius_all(6);style.content_margin_left=18;style.content_margin_right=17;style.content_margin_top=13;style.content_margin_bottom=13;panel.add_theme_stylebox_override("panel",style)
	var missionbox:=VBoxContainer.new();panel.add_child(missionbox)
	var label:=Label.new();label.text="ACTIVE CONTRACT";label.add_theme_color_override("font_color",Color("65d7c6"));label.add_theme_font_size_override("font_size",12);missionbox.add_child(label)
	var title:=Label.new();title.name="MissionTitle";title.add_theme_font_size_override("font_size",20);title.add_theme_color_override("font_color",Color("f1f0e7"));missionbox.add_child(title)
	var description:=Label.new();description.name="MissionDesc";description.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;description.custom_minimum_size=Vector2(305,52);description.add_theme_color_override("font_color",Color("aab8bc"));description.add_theme_font_size_override("font_size",13);missionbox.add_child(description)
	var bottom:=Label.new();bottom.name="Controls";bottom.set_anchors_preset(Control.PRESET_BOTTOM_LEFT);bottom.position=Vector2(38,-50);bottom.text="WASD / ARROWS  DRIVE     SPACE  HANDBRAKE     E  DELIVER     ESC  PAUSE";bottom.add_theme_color_override("font_color",Color("cfdbd7"));bottom.add_theme_font_size_override("font_size",13);root.add_child(bottom)
	var speedlabel:=Label.new();speedlabel.name="Speed";speedlabel.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT);speedlabel.position=Vector2(-240,-102);speedlabel.size=Vector2(200,66);speedlabel.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT;speedlabel.add_theme_font_size_override("font_size",34);speedlabel.add_theme_color_override("font_color",Color("e7f4ef"));root.add_child(speedlabel)
	var message:=Label.new();message.name="Message";message.set_anchors_preset(Control.PRESET_CENTER_TOP);message.position=Vector2(-360,42);message.size=Vector2(720,48);message.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;message.add_theme_font_size_override("font_size",19);message.add_theme_color_override("font_color",Color("f9e6b0"));root.add_child(message)
	var map:=Control.new();map.name="Map";map.set_anchors_preset(Control.PRESET_TOP_RIGHT);map.position=Vector2(-196,128);map.size=Vector2(164,164);root.add_child(map)
	pause_overlay=ColorRect.new();pause_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);pause_overlay.color=Color(0.01,0.02,0.035,0.82);pause_overlay.visible=false;root.add_child(pause_overlay)
	var pause_text=Label.new();pause_text.set_anchors_preset(Control.PRESET_CENTER);pause_text.position=Vector2(-170,-55);pause_text.size=Vector2(340,110);pause_text.text="PAUSED\nESC TO RETURN";pause_text.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;pause_text.vertical_alignment=VERTICAL_ALIGNMENT_CENTER;pause_text.add_theme_font_size_override("font_size",28);pause_text.add_theme_color_override("font_color",Color("e5f4ef"));pause_overlay.add_child(pause_text)
	map.draw.connect(_draw_minimap.bind(map))

func _draw_minimap(map:Control) -> void:
	var c=map.get_canvas_item();var r=Rect2(map.position,map.size)
	RenderingServer.canvas_item_add_rect(c,r,Color(0.025,0.05,0.065,0.84))
	var city=float(game.HALF_CITY*2+18);var unit=map.size.x/city
	for i in range(game.BLOCKS+1):
		var p=map.position.x+(float(i)*game.SPACING+game.HALF_CITY)*unit
		RenderingServer.canvas_item_add_rect(c,Rect2(Vector2(p-1,map.position.y),Vector2(2,map.size.y)),Color("56636a"))
		RenderingServer.canvas_item_add_rect(c,Rect2(Vector2(map.position.x,p-1),Vector2(map.size.x,2)),Color("56636a"))
	var cp=map.position+Vector2(game.car.global_position.x+game.HALF_CITY,game.car.global_position.z+game.HALF_CITY)*unit
	var mp=map.position+Vector2(game.targets[game.mission_idx].x+game.HALF_CITY,game.targets[game.mission_idx].z+game.HALF_CITY)*unit
	RenderingServer.canvas_item_add_circle(c,mp,3.7,Color("53e7d4"));RenderingServer.canvas_item_add_circle(c,cp,4.0,Color("fff0a8"))
	map.draw_rect(r,Color(0.48,0.78,0.75,0.75),false,1.0)

func _process(_delta:float) -> void:
	if not is_instance_valid(game) or not is_instance_valid(game.car):return
	var root=get_child(0)
	root.get_node("Money").text="$ %06d"%game.cash
	var stars="";for i in range(5):stars+="◆ " if game.wanted>i else "◇ "
	root.get_node("Heat").text="POLICE  "+stars
	root.get_node("MissionTitle").text=game.mission_name()
	root.get_node("MissionDesc").text=game.mission_hint()
	root.get_node("Speed").text="%03d  KM/H"%int(abs(game.car.speed)*3.6)
	var m=root.get_node("Message");m.text=game.msg if game.msg_left>0 else ""
	if root.has_node("Map"):root.get_node("Map").queue_redraw()

func set_pause_visible(value:bool) -> void:
	if pause_overlay:pause_overlay.visible=value

