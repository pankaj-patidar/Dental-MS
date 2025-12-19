// Copyright (c) 2016, ESS LLP and contributors
// For license information, please see license.txt

frappe.ui.form.on('Patient Encounter', {
	onload: function(frm) {
		if (!frm.doc.__islocal && frm.doc.docstatus === 1 &&
			frm.doc.inpatient_status == 'Admission Scheduled') {
				frappe.db.get_value('Inpatient Record', frm.doc.inpatient_record,
					['admission_encounter', 'status']).then(r => {
						if (r.message) {
							if (r.message.admission_encounter == frm.doc.name &&
								r.message.status == 'Admission Scheduled') {
									frm.add_custom_button(__('Cancel Admission'), function() {
										cancel_ip_order(frm);
									});
								}
							if (r.message.status == 'Admitted') {
								frm.add_custom_button(__('Schedule Discharge'), function() {
									schedule_discharge(frm);
								});
							}
						}
				})
		}
		show_clinical_notes(frm);
		show_orders(frm);
	},

	setup: function(frm) {
		frm.get_field('therapies').grid.editable_fields = [
			{fieldname: 'therapy_type', columns: 8},
			{fieldname: 'no_of_sessions', columns: 2}
		];
		frm.get_field('drug_prescription').grid.editable_fields = [
			{fieldname: 'drug_code', columns: 2},
			{fieldname: 'drug_name', columns: 2},
			{fieldname: 'dosage', columns: 2},
			{fieldname: 'period', columns: 2},
			{fieldname: 'dosage_form', columns: 2}
		];
		if (frappe.meta.get_docfield('Drug Prescription', 'medication').in_list_view === 1) {
			frm.get_field('drug_prescription').grid.editable_fields.splice(0, 0, {fieldname: 'medication', columns: 3});
			frm.get_field('drug_prescription').grid.editable_fields.splice(2, 1); // remove item description
		}
	},

	refresh: function(frm) {
		refresh_field('drug_prescription');
		refresh_field('lab_test_prescription');

		if(!frm.doc.odontogram) {
            frm.doc.odontogram = Array(32).fill(1); // 32 teeth, all healthy by default
            frm.refresh_field('odontogram');
        }

        // Render chart
		// render_odontogram(frm);
        // apply_saved_colors(frm);

		// Default view mode if not set
        if (!frm.odontogram_view) frm.odontogram_view = 'anatomical';
        render_odontogram(frm);

		if (!frm.doc.__islocal) {
			if (frm.doc.docstatus === 1) {
				if(!['Discharge Scheduled', 'Admission Scheduled', 'Admitted'].includes(frm.doc.inpatient_status)) {
					frm.add_custom_button(__('Schedule Admission'), function() {
						schedule_inpatient(frm);
					});
				}
			}

			frm.add_custom_button(__("Refer Patient"), function() {
				create_patient_referral(frm);
			},__("Create"));

			frm.add_custom_button(__('Patient History'), function() {
				if (frm.doc.patient) {
					frappe.route_options = {'patient': frm.doc.patient};
					frappe.set_route('patient_history');
				} else {
					frappe.msgprint(__('Please select Patient'));
				}
			},__('View'));

			if (frm.doc.docstatus == 1 && frm.doc.drug_prescription && frm.doc.drug_prescription.length>0) {
				frm.add_custom_button(__('Medication Request'), function() {
					create_medication_request(frm);
				},__('Create'));
			}

			if (frm.doc.docstatus == 1 && (
				(frm.doc.lab_test_prescription && frm.doc.lab_test_prescription.length>0) ||
				(frm.doc.procedure_prescription && frm.doc.procedure_prescription.length>0) ||
				(frm.doc.therapies && frm.doc.therapies.length>0)
				)) {
				frm.add_custom_button(__('Service Request'), function() {
					create_service_request(frm);
				},__('Create'));
			}

			frm.add_custom_button(__('Vital Signs'), function() {
				create_vital_signs(frm);
			},__('Create'));

			frm.add_custom_button(__('Medical Record'), function() {
				create_medical_record(frm);
			},__('Create'));

			frm.add_custom_button(__('Clinical Procedure'), function() {
				create_procedure(frm);
			},__('Create'));

			frm.add_custom_button(__("Clinical Note"), function() {
				frappe.route_options = {
					"patient": frm.doc.patient,
					"reference_doc": "Patient Encounter",
					"reference_name": frm.doc.name,
					"practitioner": frm.doc.practitioner
				}
				frappe.new_doc("Clinical Note");
			},__('Create'));

			if (!frm.doc.ref_sales_invoice){
				frm.add_custom_button(__("Make Payment"), function(){
					make_payment(frm);
					})
			}
			

			if (frm.doc.drug_prescription && frm.doc.inpatient_record && frm.doc.inpatient_status === "Admitted") {
				frm.add_custom_button(__('Inpatient Medication Order'), function() {
					frappe.model.open_mapped_doc({
						method: 'healthcare.healthcare.doctype.patient_encounter.patient_encounter.make_ip_medication_order',
						frm: frm
					});
				},__('Create'));
			}

			frm.add_custom_button(__('Nursing Tasks'), function() {
				create_nursing_tasks(frm);
			},__('Create'));
		}

		frm.set_query('patient', function() {
			return {
				filters: {'status': 'Active'}
			};
		});

		frm.set_query('drug_code', 'drug_prescription', function() {
			return {
				filters: {
					is_stock_item: 1
				}
			};
		});

		frm.set_query('lab_test_code', 'lab_test_prescription', function() {
			return {
				filters: {
					is_billable: 1
				}
			};
		});

		frm.set_query('appointment', function() {
			return {
				filters: {
					//	Scheduled filter for demo ...
					status:['in',['Open','Scheduled']]
				}
			};
		});

		frm.set_query("code_value", "codification_table", function(doc, cdt, cdn) {
			let row = frappe.get_doc(cdt, cdn);
			if (row.code_system) {
				return {
					filters: {
						code_system: row.code_system
					}
				};
			}
		});

		frm.set_query("medication", "drug_prescription", function() {
			return {
				filters: {
					disabled: false
				}
			};
		})

		frm.set_df_property('patient', 'read_only', frm.doc.appointment ? 1 : 0);

		if (frm.doc.google_meet_link && frappe.datetime.now_date() <= frm.doc.encounter_date) {
			frm.dashboard.set_headline(
				__("Join video conference with {0}", [
					`<a target='_blank' href='${frm.doc.google_meet_link}'>Google Meet</a>`,
				])
			);
		}
		if (frappe.meta.get_docfield('Drug Prescription', 'medication').in_list_view === 1) {
			frm.set_query('drug_code', 'drug_prescription', function(doc, cdt, cdn) {
				let row = frappe.get_doc(cdt, cdn);
				let filters = { is_stock_item: 1 };
				if (row.medication) {
					filters.medication = row.medication;
				}
				return {
					query: 'healthcare.healthcare.doctype.patient_encounter.patient_encounter.get_medications_query',
					filters: filters
				};
			});
		}
		var table_list =  ["drug_prescription", "lab_test_prescription", "procedure_prescription", "therapies"]
		apply_code_sm_filter_to_child(frm, "priority", table_list, "Priority")
		apply_code_sm_filter_to_child(frm, "intent", table_list, "Intent")
	},

	before_submit: function (frm) {
	// Check if payment is done (Sales Invoice exists)
		if (!frm.doc.ref_sales_invoice) {
			frappe.throw(
				__("Please complete the payment before submitting this Encounter.")
			);
		}
	},
	appointment: function(frm) {
		frm.events.set_appointment_fields(frm);
	},

	patient: function(frm) {
		frm.events.set_patient_info(frm);
	},

	practitioner: function(frm) {
		if (!frm.doc.practitioner) {
			frm.set_value('practitioner_name', '');
		}
	},
	set_appointment_fields: function(frm) {
		if (frm.doc.appointment) {
			frappe.call({
				method: 'frappe.client.get',
				args: {
					doctype: 'Patient Appointment',
					name: frm.doc.appointment
				},
				callback: function(data) {
					let values = {
						'patient':data.message.patient,
						'type': data.message.appointment_type,
						'practitioner': data.message.practitioner,
						'invoiced': data.message.invoiced,
						'company': data.message.company
					};
					frm.set_value(values);
					frm.set_df_property('patient', 'read_only', 1);
				}
			});
		}
		else {
			let values = {
				'patient': '',
				'patient_name': '',
				'type': '',
				'practitioner': '',
				'invoiced': 0,
				'patient_sex': '',
				'patient_age': '',
				'inpatient_record': '',
				'inpatient_status': ''
			};
			frm.set_value(values);
			frm.set_df_property('patient', 'read_only', 0);
		}
	},

	set_patient_info: async function(frm) {
		if (frm.doc.patient) {
			let me = frm
			frappe.call({
				method: 'healthcare.healthcare.doctype.patient.patient.get_patient_detail',
				args: {
					patient: frm.doc.patient
				},
				callback: function(data) {
					let age = '';
					if (data.message.dob) {
						age = calculate_age(data.message.dob);
					}
					let values = {
						'patient_age': age,
						'patient_name':data.message.patient_name,
						'patient_sex': data.message.sex,
						'inpatient_record': data.message.inpatient_record,
						'inpatient_status': data.message.inpatient_status
					};

					frappe.run_serially([
						()=>frm.set_value(values),
						()=>show_clinical_notes(frm),
						()=>show_orders(frm),
					]);
				}
			});
		} else {
			let values = {
				'patient_age': '',
				'patient_name':'',
				'patient_sex': '',
				'inpatient_record': '',
				'inpatient_status': ''
			};
			frm.set_value(values);
		}
	},

	get_applicable_treatment_plans: function(frm) {
		frappe.call({
			method: 'get_applicable_treatment_plans',
			doc: frm.doc,
			args: {'encounter': frm.doc},
			freeze: true,
			freeze_message: __('Fetching Treatment Plans'),
			callback: function() {
				new frappe.ui.form.MultiSelectDialog({
					doctype: "Treatment Plan Template",
					target: this.cur_frm,
					setters: {
						medical_department: "",
					},
					action(selections) {
						frappe.call({
							method: 'set_treatment_plans',
							doc: frm.doc,
							args: selections,
						}).then(() => {
							frm.refresh_fields();
							frm.dirty();
						});
						cur_dialog.hide();
					}
				});


			}
		});
	},

})

// ------------------------------------

/***************************************************
 * CONFIGURATION
 ***************************************************/
const CHILD_TABLE_FIELD = "odontogram";
const STATUS_COLORS = {
    'Caries': '#FF5858',
    'Filled': '#5897FF',
    'Missing': '#4a4a4a',
    'Bridge': '#FACC15',
    'Healthy': '#FFFFFF'
};

/***************************************************
 * 1. SVG GENERATORS
 ***************************************************/

// Anatomical View (Colleague's Style)
function get_anatomical_svg(tooth, x, y) {
    return `
    <g class="tooth-wrapper" data-tooth="${tooth}" transform="translate(${x}, ${y}) scale(0.65)">
        <path class="tooth-outline" d="M32 6 C20 6 10 14 10 26 C10 34 14 42 16 48 C18 54 18 86 26 86 C30 86 30 64 32 64 C34 64 34 86 38 86 C46 86 46 54 48 48 C50 42 54 34 54 26 C54 14 44 6 32 6 Z" fill="white" stroke="#333" stroke-width="1.5"/>
        <path class="tooth-part" data-pos="top"    d="M14 6 H50 V18 H14 Z" fill="white" stroke="#999"/>
        <path class="tooth-part" data-pos="center" d="M18 18 H46 V46 H18 Z" fill="white" stroke="#999"/>
        <path class="tooth-part" data-pos="bottom" d="M14 46 H50 V58 H14 Z" fill="white" stroke="#999"/>
        <path class="tooth-part" data-pos="left"   d="M6 18 H18 V46 H6 Z" fill="white" stroke="#999"/>
        <path class="tooth-part" data-pos="right"  d="M46 18 H58 V46 H46 Z" fill="white" stroke="#999"/>
        <text x="32" y="100" font-size="16" text-anchor="middle" font-weight="bold" fill="#333">${tooth}</text>
    </g>`;
}

// Schematic View (Square/Simplified Style)
function get_schematic_svg(tooth, x, y) {
    return `
    <g class="tooth-wrapper" data-tooth="${tooth}" transform="translate(${x}, ${y})">
        <polygon points="0,0 40,0 30,10 10,10" class="tooth-part" data-pos="top" fill="white" stroke="#bcbcbc"/>
        <polygon points="40,0 40,40 30,30 30,10" class="tooth-part" data-pos="right" fill="white" stroke="#bcbcbc"/>
        <polygon points="40,40 0,40 10,30 30,30" class="tooth-part" data-pos="bottom" fill="white" stroke="#bcbcbc"/>
        <polygon points="0,0 0,40 10,30 10,10" class="tooth-part" data-pos="left" fill="white" stroke="#bcbcbc"/>
        <rect x="10" y="10" width="20" height="20" class="tooth-part" data-pos="center" fill="white" stroke="#bcbcbc"/>
        <text x="20" y="55" font-size="12" text-anchor="middle" font-weight="bold">${tooth}</text>
    </g>`;
}

/***************************************************
 * 2. RENDERER
 ***************************************************/
function render_odontogram(frm) {
    const wrapper = $(frm.fields_dict.odontogram_html.wrapper);
    wrapper.empty();

    const is_ana = (frm.odontogram_view === 'anatomical');
    
    // Toggle Button UI
    let html = `
        <div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
            <div class="btn-group">
                <button class="btn btn-default btn-sm btn-view ${is_ana ? 'btn-primary' : ''}" data-view="anatomical">Anatomical</button>
                <button class="btn btn-default btn-sm btn-view ${!is_ana ? 'btn-primary' : ''}" data-view="schematic">Schematic</button>
            </div>
            <div style="font-size: 12px; font-weight: bold; color: #666;">FDI NOTATION</div>
        </div>
        <div class="chart-container" style="background:#fff; border:1px solid #d1d8dd; padding:20px; border-radius:8px;">
            <svg id="odontogram-svg" viewBox="0 0 1000 ${is_ana ? 350 : 250}" style="width:100%">
                ${generate_rows(is_ana)}
            </svg>
            ${get_legend_html()}
        </div>
    `;

    wrapper.append(html);
    bind_events(frm, wrapper);
    apply_saved_colors(frm);
}

function generate_rows(is_ana) {
    const fn = is_ana ? get_anatomical_svg : get_schematic_svg;
    const spacing = is_ana ? 60 : 55;
    
    let rows = "";
    // Upper
    [18,17,16,15,14,13,12,11].forEach((t, i) => rows += fn(t, 20 + i * spacing, 20));
    [21,22,23,24,25,26,27,28].forEach((t, i) => rows += fn(t, 520 + i * spacing, 20));
    // Lower
    [48,47,46,45,44,43,42,41].forEach((t, i) => rows += fn(t, 20 + i * spacing, is_ana ? 180 : 130));
    [31,32,33,34,35,36,37,38].forEach((t, i) => rows += fn(t, 520 + i * spacing, is_ana ? 180 : 130));
    
    return rows;
}

/***************************************************
 * 3. EVENTS & DATA
 ***************************************************/
function bind_events(frm, wrapper) {
    // View Switcher
    wrapper.find('.btn-view').on('click', function() {
        frm.odontogram_view = $(this).data('view');
        render_odontogram(frm);
    });

    // Tooth Click
    wrapper.off('click', '.tooth-part').on('click', '.tooth-part', function() {
        const tooth = $(this).closest('.tooth-wrapper').attr('data-tooth');
        const surface = $(this).attr('data-pos');
        
        // Find existing record
        let existing = (frm.doc[CHILD_TABLE_FIELD] || []).find(r => r.tooth_number == tooth && r.surface == surface);

        let d = new frappe.ui.Dialog({
            title: `Tooth ${tooth} - ${surface}`,
            fields: [
                { label: 'Status', fieldname: 'status', fieldtype: 'Select', options: Object.keys(STATUS_COLORS).join('\n'), default: existing ? existing.status : 'Healthy' },
                { label: 'Notes', fieldname: 'notes', fieldtype: 'Small Text', default: existing ? existing.notes : '' }
            ],
            primary_action_label: 'Update',
            primary_action(values) {
                if (values.status === "Healthy") {
                    if (existing) frm.clear_table(CHILD_TABLE_FIELD, existing.name);
                } else {
                    let row = existing || frm.add_child(CHILD_TABLE_FIELD);
                    frappe.model.set_value(row.doctype, row.name, {
                        tooth_number: tooth,
                        surface: surface,
                        status: values.status,
                        notes: values.notes
                    });
                }
                frm.refresh_field(CHILD_TABLE_FIELD);
                apply_saved_colors(frm);
                d.hide();
            }
        });
        d.show();
    });
}

function apply_saved_colors(frm) {
    const $svg = $(frm.fields_dict.odontogram_html.wrapper);
    $svg.find('.tooth-part').css('fill', 'white');

    (frm.doc[CHILD_TABLE_FIELD] || []).forEach(row => {
        const color = STATUS_COLORS[row.status] || 'white';
        $svg.find(`.tooth-wrapper[data-tooth="${row.tooth_number}"] .tooth-part[data-pos="${row.surface}"]`)
            .css('fill', color);
    });
}

function get_legend_html() {
    let legend = `<div style="display:flex; justify-content:center; gap:15px; margin-top:15px; font-size:11px; border-top:1px solid #eee; padding-top:10px;">`;
    for (let s in STATUS_COLORS) {
        legend += `<div style="display:flex; align-items:center; gap:5px;"><div style="width:10px; height:10px; background:${STATUS_COLORS[s]}; border:1px solid #ccc;"></div><span>${s}</span></div>`;
    }
    return legend + `</div>`;
}

// ------------------------------------
let make_payment =  function(frm) {
	console.log("Make Payment")
	automate_invoicing = 1
	make_registration(frm, automate_invoicing);
	
	function make_registration (frm, automate_invoicing) {

		let fields = [
			{
				label: "Patient",
				fieldname: "patient",
				fieldtype: "Data",
				read_only: true,
			},
			{
				label: "Mode of Payment",
				fieldname: "mode_of_payment",
				fieldtype: "Link",
				options: "Mode of Payment",
				reqd: 1,
			},
			{
				fieldtype: "Column Break",
			},
			{
				label: "Consultation Charge",
				fieldname: "consultation_charge",
				fieldtype: "Currency",
				read_only: false,
			},
			{
				label: "Total Payable",
				fieldname: "total_payable",
				fieldtype: "Currency",
				read_only: true,
			},
			{
				label: __("Additional Discount"),
				fieldtype:"Section Break",
				collapsible: 1,
			},
			{
				label: "Discount Percentage",
				fieldname: "discount_percentage",
				fieldtype: "Percent",
				default: 0,
			},
			{
				fieldtype: "Column Break",
			},
			{
				label: "Discount Amount",
				fieldname: "discount_amount",
				fieldtype: "Currency",
				default: 0,
			}
		];

		if (frm.doc.appointment_for == "Practitioner") {
			let pract_dict = {
				label: "Practitioner",
				fieldname: "practitioner",
				fieldtype: "Data",
				read_only: true,
			};
			fields.splice(3, 0, pract_dict);
		} else if (frm.doc.appointment_for == "Service Unit") {
			let su_dict = {
				label: "Service Unit",
				fieldname: "service_unit",
				fieldtype: "Data",
				read_only: true,
			};
			fields.splice(3, 0, su_dict);
		} else if (frm.doc.appointment_for == "Department") {
			let dept_dict = {
				label: "Department",
				fieldname: "department",
				fieldtype: "Data",
				read_only: true,
			};
			fields.splice(3, 0, dept_dict);
		}

		if (automate_invoicing) {
			show_payment_dialog(frm, fields);
		}
	}
	function show_payment_dialog(frm, fields) {
		let d = new frappe.ui.Dialog({
			title: "Enter Payment Details",
			fields: fields,
			primary_action_label: "Create Invoice",
			primary_action: async function(values) {
				if (frm.is_dirty()) {
					await frm.save();
				}
				frappe.call({
					method: "healthcare.healthcare.doctype.patient_encounter.patient_encounter.invoice_encounter",
					args: {
						"encounter_name": frm.doc.name,
						"consultation_charge": values.consultation_charge,
						"total_payable": values.total_payable,
						"discount_percentage": values.discount_percentage,
						"discount_amount": values.discount_amount
					},
					callback: async function (data) {
						if (!data.exc) {
							await frm.reload_doc();
							if (frm.doc.ref_sales_invoice) {
								d.get_field("mode_of_payment").$input.prop("disabled", true);
								d.get_field("discount_percentage").$input.prop("disabled", true);
								d.get_field("discount_amount").$input.prop("disabled", true);
								d.get_primary_btn().attr("disabled", true);
								d.get_secondary_btn().attr("disabled", false);
							}
						}
					}
				});
			},
			secondary_action_label: __(`<svg class="icon  icon-sm" style="">
				<use class="" href="#icon-printer"></use>
			</svg>`),
			secondary_action() {
				window.open("/app/print/Sales Invoice/" + frm.doc.ref_sales_invoice, "_blank");
				d.hide();
			}
		});
		d.fields_dict["mode_of_payment"].df.onchange = () => {
			if (d.get_value("mode_of_payment")) {
				frm.set_value("mode_of_payment", d.get_value("mode_of_payment"));
			}
		};
		d.fields_dict["consultation_charge"].df.onchange = () => {
			frm.set_value("paid_amount", d.get_value("total_payable"));
			recalculate_from_percentage();
		};
		d.get_secondary_btn().attr("disabled", true);
		d.set_values({
			"patient": frm.doc.patient_name,
			"consultation_charge": frm.doc.consultation_charge,
			"total_payable": frm.doc.paid_amount,
		});

		if (frm.doc.appointment_for == "Practitioner") {
			d.set_value("practitioner", frm.doc.practitioner_name);
		} else if (frm.doc.appointment_for == "Service Unit") {
			d.set_value("service_unit", frm.doc.service_unit);
		} else if (frm.doc.appointment_for == "Department") {
			d.set_value("department", frm.doc.department);
		}

		if (frm.doc.mode_of_payment) {
			d.set_value("mode_of_payment", frm.doc.mode_of_payment);
		}
		d.show();

		d.fields_dict["discount_percentage"].df.onchange = () => validate_discount("discount_percentage");
		d.fields_dict["discount_amount"].df.onchange = () => validate_discount("discount_amount");

		function validate_discount(field) {
			let message = "";
			let discount_percentage = d.get_value("discount_percentage");
			let discount_amount = d.get_value("discount_amount");
			let consultation_charge = d.get_value("consultation_charge");

			if (field === "discount_percentage") {
				if (discount_percentage > 100 || discount_percentage < 0) {
					d.get_primary_btn().attr("disabled", true);
					message = "Invalid discount percentage";
				} else {
					d.get_primary_btn().attr("disabled", false);
					frm.via_discount_percentage = true;
					if (discount_percentage && discount_amount) {
						d.set_value("discount_amount", 0);
					}
					discount_amount = consultation_charge * (discount_percentage / 100);

					d.set_values({
						"discount_amount": discount_amount,
						"total_payable": consultation_charge - discount_amount,
					}).then(() => delete frm.via_discount_percentage);
				}
			} else if (field === "discount_amount") {
				if (consultation_charge < discount_amount || discount_amount < 0) {
					d.get_primary_btn().attr("disabled", true);
					message = "Discount amount should not be more than Consultation Charge";
				} else {
					d.get_primary_btn().attr("disabled", false);
					if (!frm.via_discount_percentage) {
						discount_percentage = (discount_amount / consultation_charge) * 100;
						d.set_values({
							"discount_percentage": discount_percentage,
							"total_payable": consultation_charge - discount_amount,
						});
					}
				}
			}
			show_message(d, message, field);
		}
		function recalculate_from_percentage() {
			let consultation_charge = flt(d.get_value("consultation_charge"));
			let discount_percentage = flt(d.get_value("discount_percentage"));

			// Safety check
			if (consultation_charge < 0 || discount_percentage < 0 || discount_percentage > 100) {
				d.get_primary_btn().attr("disabled", true);
				return;
			}

			let discount_amount = consultation_charge * (discount_percentage / 100);

			d.get_primary_btn().attr("disabled", false);

			d.set_values({
				discount_amount: discount_amount,
				total_payable: consultation_charge - discount_amount
			});
		}

	}
};

var schedule_inpatient = function(frm) {
	let service_unit_type = "";
	var dialog = new frappe.ui.Dialog({
		title: 'Patient Admission',
		fields: [
			{fieldtype: 'Link', label: 'Medical Department', fieldname: 'medical_department', options: 'Medical Department', reqd: 1},
			{fieldtype: 'Link', label: 'Healthcare Practitioner (Primary)', fieldname: 'primary_practitioner', options: 'Healthcare Practitioner', reqd: 1},
			{fieldtype: 'Link', label: 'Healthcare Practitioner (Secondary)', fieldname: 'secondary_practitioner', options: 'Healthcare Practitioner'},
			{fieldtype: 'Link', label: 'Nursing Checklist Template', fieldname: 'admission_nursing_checklist_template', options: 'Nursing Checklist Template'},
			{fieldtype: 'Column Break'},
			{fieldtype: 'Date', label: 'Admission Ordered For', fieldname: 'admission_ordered_for', default: 'Today'},
			{fieldtype: 'Link', label: 'Service Unit Type', fieldname: 'service_unit_type', options: 'Healthcare Service Unit Type'},
			{fieldtype: 'Int', label: 'Expected Length of Stay', fieldname: 'expected_length_of_stay'},
			{fieldtype: 'Section Break'},
			{fieldtype: 'Long Text', label: 'Admission Instructions', fieldname: 'admission_instruction'}
		],
		primary_action_label: __('Order Admission'),
		primary_action : function() {
			var args = {
				patient: frm.doc.patient,
				admission_encounter: frm.doc.name,
				referring_practitioner: frm.doc.practitioner,
				company: frm.doc.company,
				medical_department: dialog.get_value('medical_department'),
				primary_practitioner: dialog.get_value('primary_practitioner'),
				secondary_practitioner: dialog.get_value('secondary_practitioner'),
				admission_ordered_for: dialog.get_value('admission_ordered_for'),
				admission_service_unit_type: dialog.get_value('service_unit_type'),
				expected_length_of_stay: dialog.get_value('expected_length_of_stay'),
				admission_instruction: dialog.get_value('admission_instruction'),
				admission_nursing_checklist_template: dialog.get_value('admission_nursing_checklist_template')
			}
			frappe.call({
				method: 'healthcare.healthcare.doctype.inpatient_record.inpatient_record.schedule_inpatient',
				args: {
					args: args
				},
				callback: function(data) {
					if (!data.exc) {
						frm.reload_doc();
					}
				},
				freeze: true,
				freeze_message: __('Scheduling Patient Admission')
			});
			frm.refresh_fields();
			dialog.hide();
		}
	});

	dialog.set_values({
		'medical_department': frm.doc.medical_department,
		'primary_practitioner': frm.doc.practitioner,
	});

	dialog.fields_dict['service_unit_type'].get_query = function() {
		return {
			filters: {
				'inpatient_occupancy': 1,
				'allow_appointments': 0
			}
		};
	};

	dialog.fields_dict["service_unit_type"].df.onchange = () => {
		if (dialog.get_value("service_unit_type") && dialog.get_value("service_unit_type") != service_unit_type) {
			service_unit_type = dialog.get_value("service_unit_type");
			frappe.db.get_value("Healthcare Service Unit Type", {name: dialog.get_value("service_unit_type")}, ["is_billable", "item"])
			.then(r => {
				if (r.message.is_billable && !r.message.item) {
					frappe.msgprint({
						message: __("Selected service unit type doesn't have any item linked"),
						title: __("Warning"),
						indicator: "orange",
					});
				}
			})
		}
	};

	dialog.show();
	dialog.$wrapper.find('.modal-dialog').css('width', '800px');
};

var schedule_discharge = function(frm) {
	var dialog = new frappe.ui.Dialog ({
		title: 'Inpatient Discharge',
		fields: [
			{fieldtype: 'Date', label: 'Discharge Ordered Date', fieldname: 'discharge_ordered_date', default: 'Today', read_only: 1},
			{fieldtype: 'Date', label: 'Followup Date', fieldname: 'followup_date'},
			{fieldtype: 'Link', label: 'Nursing Checklist Template', options: 'Nursing Checklist Template', fieldname: 'discharge_nursing_checklist_template'},
			{fieldtype: 'Column Break'},
			{fieldtype: 'Small Text', label: 'Discharge Instructions', fieldname: 'discharge_instructions'},
			{fieldtype: 'Section Break', label:'Discharge Summary'},
			{fieldtype: 'Long Text', label: 'Discharge Note', fieldname: 'discharge_note'}
		],
		primary_action_label: __('Order Discharge'),
		primary_action : function() {
			var args = {
				patient: frm.doc.patient,
				discharge_encounter: frm.doc.name,
				discharge_practitioner: frm.doc.practitioner,
				discharge_ordered_date: dialog.get_value('discharge_ordered_date'),
				followup_date: dialog.get_value('followup_date'),
				discharge_instructions: dialog.get_value('discharge_instructions'),
				discharge_note: dialog.get_value('discharge_note'),
				discharge_nursing_checklist_template: dialog.get_value('discharge_nursing_checklist_template')
			}
			frappe.call ({
				method: 'healthcare.healthcare.doctype.inpatient_record.inpatient_record.schedule_discharge',
				args: {args},
				callback: function(data) {
					if(!data.exc){
						frm.reload_doc();
					}
				},
				freeze: true,
				freeze_message: 'Scheduling Inpatient Discharge'
			});
			frm.refresh_fields();
			dialog.hide();
		}
	});

	dialog.show();
	dialog.$wrapper.find('.modal-dialog').css('width', '800px');
};

let create_medical_record = function(frm) {
	if (!frm.doc.patient) {
		frappe.throw(__('Please select patient'));
	}
	frappe.route_options = {
		'patient': frm.doc.patient,
		'status': 'Open',
		'reference_doctype': 'Patient Medical Record',
		'reference_owner': frm.doc.owner
	};
	frappe.new_doc('Patient Medical Record');
};

let create_vital_signs = function(frm) {
	if (!frm.doc.patient) {
		frappe.throw(__('Please select patient'));
	}
	frappe.route_options = {
		'patient': frm.doc.patient,
		'encounter': frm.doc.name,
		'company': frm.doc.company
	};
	frappe.new_doc('Vital Signs');
};

let create_procedure = function(frm) {
	if (!frm.doc.patient) {
		frappe.throw(__('Please select patient'));
	}
	frappe.route_options = {
		'patient': frm.doc.patient,
		'medical_department': frm.doc.medical_department,
		'company': frm.doc.company
	};
	frappe.new_doc('Clinical Procedure');
};

let create_nursing_tasks = function(frm) {
	const d = new frappe.ui.Dialog({

		title: __('Create Nursing Tasks'),

		fields: [
			{
				label: __('Nursing Checklist Template'),
				fieldtype: 'Link',
				options: 'Nursing Checklist Template',
				fieldname: 'template',
				reqd: 1,
			},
			{
				label: __('Start Time'),
				fieldtype: 'Datetime',
				fieldname: 'start_time',
				default: frappe.datetime.now_datetime(),
				reqd: 1,
			},
		],

		primary_action_label: __('Create Nursing Tasks'),

		primary_action: () => {

			let values = d.get_values();
			frappe.call({
				method: 'healthcare.healthcare.doctype.nursing_task.nursing_task.create_nursing_tasks_from_template',
				args: {
					'template': values.template,
					'doc': frm.doc,
					'start_time': values.start_time
				},
				callback: (r) => {
					if (r && !r.exc) {
						frappe.show_alert({
							message: __('Nursing Tasks Created'),
							indicator: 'success'
						});
					}
				}
			});

			d.hide();		frm.set_query('lab_test_code', 'lab_test_prescription', function() {
				return {
					filters: {
						is_billable: 1
					}
				};
			});
		}
	});

	d.show();
};

let calculate_age = function(birth) {
	let ageMS = Date.parse(Date()) - Date.parse(birth);
	let age = new Date();
	age.setTime(ageMS);
	let years =  age.getFullYear() - 1970;
	return `${years} ${__('Years(s)')} ${age.getMonth()} ${__('Month(s)')} ${age.getDate()} ${__('Day(s)')}`;
};

let cancel_ip_order = function(frm) {
	frappe.prompt([
		{
			fieldname: 'reason_for_cancellation',
			label: __('Reason for Cancellation'),
			fieldtype: 'Small Text',
			reqd: 1
		}
	],
	function(data) {
		frappe.call({
			method: 'healthcare.healthcare.doctype.inpatient_record.inpatient_record.set_ip_order_cancelled',
			async: false,
			freeze: true,
			args: {
				inpatient_record: frm.doc.inpatient_record,
				reason: data.reason_for_cancellation,
				encounter: frm.doc.name
			},
			callback: function(r) {
				if (!r.exc) {
					frm.reload_doc();
				}
			}
		});
	}, __('Reason for Cancellation'), __('Submit'));
}

let create_service_request = function(frm) {
	frappe.call({
		method: "healthcare.healthcare.doctype.patient_encounter.patient_encounter.create_service_request",
		freeze: true,
		args: {
			encounter: frm.doc.name
		},
		callback: function(r) {
			if (r && !r.exc) {
				frm.reload_doc();
				frappe.show_alert({
					message: __('Service Request(s) Created'),
					indicator: 'success'
				});
			}
		}
	});
};

let create_medication_request = function(frm) {
	frappe.call({
		method: "healthcare.healthcare.doctype.patient_encounter.patient_encounter.create_medication_request",
		freeze: true,
		args: {
			encounter: frm.doc.name
		},
		callback: function(r) {
			if (r && !r.exc) {
				frm.reload_doc();
				frappe.show_alert({
					message: __('Medicaiton Request(s) Created'),
					indicator: 'success'
				});
			}
		}
	});
};


frappe.ui.form.on('Drug Prescription', {
	dosage: function(frm, cdt, cdn){
		frappe.model.set_value(cdt, cdn, 'update_schedule', 1);
		let child = locals[cdt][cdn];
		if (child.dosage) {
			frappe.model.set_value(cdt, cdn, 'interval_uom', 'Day');
			frappe.model.set_value(cdt, cdn, 'interval', 1);
		}
	},

	period: function(frm, cdt, cdn) {
		frappe.model.set_value(cdt, cdn, 'update_schedule', 1);
	},

	interval_uom: function(frm, cdt, cdn) {
		frappe.model.set_value(cdt, cdn, 'update_schedule', 1);
		let child = locals[cdt][cdn];
		if (child.interval_uom == 'Hour') {
			frappe.model.set_value(cdt, cdn, 'dosage', null);
		}
	},

	medication:function(frm, cdt, cdn) {
		// to set drug_code(item) if Medication Item table have only one item
		let child = locals[cdt][cdn];
		if (!child.medication) {
			return;
		}

		frappe.call({
			method: "healthcare.healthcare.doctype.patient_encounter.patient_encounter.get_medications",
			freeze: true,
			args: {
				medication: child.medication
			},
			callback: function(r) {
				if (r && !r.exc && r.message) {
					let data = r.message
					if (data.length == 1) {
						if (data[0].item) {
							frappe.model.set_value(cdt, cdn, 'drug_code', data[0].item);
						}
					} else {
						frappe.model.set_value(cdt, cdn, 'drug_code', "");
					}
				}
			}
		});
	}
});


var apply_code_sm_filter_to_child = function(frm, field, table_list, code_system) {
	table_list.forEach(function(table) {
		frm.set_query(field, table, function() {
			return {
				filters: {
					code_system: code_system
				}
			};
		});
	});
};

var show_clinical_notes = async function(frm) {
	if (frm.doc.docstatus == 0 && frm.doc.patient) {
		const clinical_notes = new healthcare.ClinicalNotes({
			frm: frm,
			notes_wrapper: $(frm.fields_dict.clinical_notes.wrapper),
		});
		clinical_notes.refresh();
	}
}

var show_orders = async function(frm) {
	if (frm.doc.docstatus == 0 && frm.doc.patient) {
		const orders = new healthcare.Orders({
			frm: frm,
			open_activities_wrapper: $(frm.fields_dict.order_history_html.wrapper),
			form_wrapper: $(frm.wrapper),
			create_orders: true,
		});
		orders.refresh();
	}
}

let create_patient_referral = function(frm) {
	var dialog = new frappe.ui.Dialog ({
		title: "Patient Referral",
		size: "large",
		fields: [
			{
				label: "References",
				fieldname: "references",
				fieldtype: "Table",
				is_editable_grid: true,
				data: [],
				fields: [
					{
						"fieldname": "refer_to",
						"fieldtype": "Link",
						"label": "Refer To",
						"options": "Healthcare Practitioner",
						"in_list_view": 1,
						"reqd": 1,
						get_query: function () {
							return {
								filters: {
									name: ["!=", frm.doc.practitioner]
								},
							};
						},
					},
					{
						"fieldname": "appointment_type",
						"fieldtype": "Link",
						"label": "Appointment Type",
						"options": "Appointment Type",
						"in_list_view": 1,
						"reqd": 1,
					},
					{
						"fieldname": "referral_note",
						"fieldtype": "Long Text",
						"label": "Referral Note",
						"in_list_view": 1,
					},
				],
			},
		],
		primary_action_label: __("Refer"),
		primary_action : function() {
			if (dialog.get_value("references").length>0) {
				frappe.call({
					method: "healthcare.healthcare.doctype.patient_encounter.patient_encounter.create_patient_referral",
					freeze: true,
					args: {
						encounter: frm.doc.name,
						references: dialog.get_value("references"),
					},
					callback: function(r) {
						if (r && !r.exc) {
							dialog.hide();
							frm.reload_doc();
							frappe.show_alert({
								message: __("Patient referral requests created successfully"),
								indicator: "success"
							});
						}
					}
				});
				frm.refresh_fields();
			}
		}
	});

	dialog.show();
};
