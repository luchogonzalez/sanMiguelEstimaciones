sap.ui.define([
	"com/ataway/app/util/Controller",
	"com/ataway/app/util/Formatter",
	"sap/ui/Device",
	"sap/m/MessageBox"
], function(Controller, Formatter, Device, MessageBox) {
	"use strict";

	return Controller.extend("com.ataway.app.controller.Detail", {
		/**
		 * Called when the detail list controller is instantiated. 
		 */
		onInit: function() {
			this.oInitialLoadFinishedDeferred = jQuery.Deferred();
			this._bMessageOpen = false;
			this._sErrorText = this.getResourceBundle().getText("errorText");

            /**
		     * Se instancian los distintos fragments, en este caso el read mode, por eso lo comento. 
		     * (No se quiere read mode, se quiere directamente editMode)
		    */
			/*if (!this._detailReadMode) { 
				this._detailReadModeFragmentName = this.getView().getId() + "detailReadMode";
				this._detailReadMode = sap.ui.xmlfragment(this._detailReadModeFragmentName, "com.ataway.app.view.DetailReadMode", this);
				this.switchMode("read");
			}*/


            /**
		     * Si no se esta en readmode, o editmode..
		     * En ambos casos instanciar fragments de edit y hacer el switchmode
		    */
			if (!this._detailEditMode || !this._detailReadMode) {
				this._detailEditModeFragmentName = this.getView().getId() + "detailEditMode";
				this._detailEditMode = sap.ui.xmlfragment(this._detailEditModeFragmentName, "com.ataway.app.view.DetailEditMode", this);
			    this.switchMode("edit");
			}

            //Se comenta create mode, porque no se necesita
			/*if (!this._detailCreateMode) {
				this._detailCreateModeFragmentName = this.getView().getId() + "detailCreateMode";
				this._detailCreateMode = sap.ui.xmlfragment(this._detailCreateModeFragmentName, "com.ataway.app.view.DetailCreateMode", this);
			}*/

			if (Device.system.phone) {
				//don't wait for the master on a phone
				this.oInitialLoadFinishedDeferred.resolve();
			} else {
				this.getView().setBusy(true);
				this.getEventBus().subscribe("Master", "InitialLoadFinished", this.onMasterLoaded, this);
			}

			this.getRouter().attachRouteMatched(this.onRouteMatched, this);

		},

		/**
		 * online icon formatter
		 */
		onlineIconVisible: function(bIsOffline, bIsPhone) {
			return bIsPhone && bIsOffline;
		},

		/**
		 * Master InitialLoadFinished event handler
		 * @param{String} sChanel event channel name
		 * @param{String}} sEvent event name
		 * @param{Object}} oData event data object
		 */
		onMasterLoaded: function(sChannel, sEvent, oData) {
			if (oData.oListItem) {
				this.bindView(oData.oListItem.getBindingContext().getPath());
				this.getView().setBusy(false);
				this.oInitialLoadFinishedDeferred.resolve();
			}
		},

		/**
		 * open a general dialog
		 */
		openDialog: function(sI18nKeyword) {
			if (!this._dialog) {
				var id = this.getView().getId();
				var frgId = id + "-msgDialog";
				this._dialog = sap.ui.xmlfragment(frgId, "com.ataway.app.view.MsgDialog", this);
				this.getView().addDependent(this._dialog);
				this._dialogText = sap.ui.core.Fragment.byId(frgId, "dialogText");
			}

			this._dialogText.bindProperty("text", sI18nKeyword);
			this._dialog.open();
		},

		/**
		 * open cancelConfirmDialog
		 */
		openCancelConfirmDialog: function() {
			if (!this._cancelConfirmDialog) {
				var id = this.getView().getId();
				var frgId = id + "-_cancelConfirmDialog";
				this._cancelConfirmDialog = sap.ui.xmlfragment(frgId, "com.ataway.app.view.CancelConfirmDialog", this);
				this.getView().addDependent(this._cancelConfirmDialog);
			}
			this._cancelConfirmDialog.open();
		},

		/**
		 * cancelConfirmDialog "yes" button handler
		 */
		confirmCancel: function() {
			var model = this.getView().getModel();
			model.resetChanges();

			if (model.newEntryContext) { //need to tell the Master List to select previous selected
				var view = this.getView();
				view.setBindingContext(null);
			}

			this.switchMode("edit");
			if (Device.system.phone) {
				this.getRouter().myNavBack("main");
			} else {
				this.getEventBus().publish("Detail", "Cancelled");
			}
			this.closeCancelConfirmDialog();
		},

		/**
		 * close cancelConfirmDialog
		 */
		closeCancelConfirmDialog: function() {
			if (this._cancelConfirmDialog) {
				this._cancelConfirmDialog.close();
			}
		},

		/**
		 * close the general dialog
		 */
		closeDialog: function() {
			if (this._dialog) {
				this._dialog.close();
			}
		},

		/**
		 * Detail view RoutePatternMatched event handler 
		 * @param{sap.ui.base.Event} oEvent router pattern matched event object
		 */
		onRouteMatched: function(oEvent) {
			var oParameters = oEvent.getParameters();

			jQuery.when(this.oInitialLoadFinishedDeferred).then(jQuery.proxy(function() {
				var oView = this.getView();

				// when detail navigation occurs, update the binding context
				if (oParameters.name !== "detail") {
					return;
				}

				var sEntityPath = "/" + oParameters.arguments.entity;

				if (oParameters.arguments.tab === "AddItem") {
					var model = this.getView().getModel();
					var newEntry = model.createEntry(sEntityPath);
					this.switchMode("create");
					model.newEntryContext = newEntry;
					//clean bounded data object
					oView.unbindObject();
					//now set new binding context
					oView.setBindingContext(newEntry);
				} else {
					this.switchMode(this._sMode);
					this.bindView(sEntityPath);

					var oIconTabBar = sap.ui.core.Fragment.byId(this._fragmentName, "idIconTabBar");
					if (oIconTabBar) {
						oIconTabBar.getItems().forEach(function(oItem) {
							oItem.bindElement(Formatter.uppercaseFirstChar(oItem.getKey()));
						});

						// Which tab?
						var sTabKey = oParameters.arguments.tab;
						this.getEventBus().publish("Detail", "TabChanged", {
							sTabKey: sTabKey
						});

						if (oIconTabBar.getSelectedKey() !== sTabKey) {
							oIconTabBar.setSelectedKey(sTabKey);
						}
					}
				}
			}, this));

		},

		/**
		 * Binds the view to the object path. Maneja el cambio de detalle al moverse por el master
		 * @param {string} sEntityPath path to the entity
		 */
		bindView: function(sEntityPath) {
			var oView = this.getView();
			oView.bindElement(sEntityPath);

			var frag = sap.ui.core.Fragment.byId(this._fragmentName, "detailFragment");
			if (frag) {
				frag.bindElement(sEntityPath + "/UsuarioDetails");
			}

			//Check if the data is already on the client
			if (!oView.getModel().getData(sEntityPath)) {

				// Check that the entity specified actually was found.
				oView.getElementBinding().attachEventOnce("dataReceived", jQuery.proxy(function() {
					var oData = oView.getModel().getData(sEntityPath);
					if (!oData) {
						this.showEmptyView();
						this.fireDetailNotFound();
					} else {
						this.fireDetailChanged(sEntityPath);
					}
				}, this));

			} else {
				this.fireDetailChanged(sEntityPath);
			}

		},

		/**
		 * display NotFound view
		 */
		showEmptyView: function() {
			this.getRouter().myNavToWithoutHash({
				currentView: this.getView(),
				targetViewName: "com.ataway.app.view.NotFound",
				targetViewType: "XML"
			});
		},

		/**
		 * publish Detail Changed event
		 * @param {string} sEntityPath path to the entity
		 */
		fireDetailChanged: function(sEntityPath) {
			this.getEventBus().publish("Detail", "Changed", {
				sEntityPath: sEntityPath
			});
		},

		/**
		 * publish Detail NotFound event
		 */
		fireDetailNotFound: function() {
			this.getEventBus().publish("Detail", "NotFound");
		},

		/**
		 * Navigates back to main view
		 */
		onNavBack: function() {
			// This is only relevant when running on phone devices
			var model = this.getView().getModel();
			if (model.hasPendingChanges() || model.newEntryContext) {
				this.openCancelConfirmDialog(jQuery.proxy(function() {
					this.getRouter().myNavBack("main");
				}, this));
			} else {
				this.getRouter().myNavBack("main");
			}
		},

		/**
		 * Detail view icon tab bar select event handler
		 * @param {sap.ui.base.Event} oEvent deta view select event object
		 */
		onDetailSelect: function(oEvent) {
			sap.ui.core.UIComponent.getRouterFor(this).navTo("detail", {
				entity: oEvent.getSource().getBindingContext().getPath().slice(1),
				tab: oEvent.getParameter("selectedKey")
			}, true);
		},

		/**
		 * switch detail view among create, edit and read mode
		 * @param {String} sMode detail view mode name
		 */
		switchMode: function(sMode) {
			if (this._sMode !== "read") {
				var model = this.getView().getModel();
				if (model) {
					if (model.newEntryContext) {
						model.deleteCreatedEntry(model.newEntryContext);
						model.newEntryContext = null;
					}
					if (model.hasPendingChanges()) {
						model.resetChanges();
					}
				}
			}

			if (this._sMode === sMode) {
				return;
			}
			this._sMode = sMode;
			var view = this.getView();
			var page = view.byId("detailPage");
			if (sMode === "create") {
				this._fragmentName = this._detailCreateModeFragmentName;
				if (page.getContent()[0] !== this._detailCreateMode) {
					page.removeAllContent();
					page.addContent(this._detailCreateMode);
				}
				view.byId("saveButton").setVisible(true);
				view.byId("cancelButton").setVisible(true);
				view.byId("editButton").setVisible(false);
				/*view.byId("deleteButton").setVisible(false);*/
			} else if (sMode === "edit") {
				this._fragmentName = this._detailEditModeFragmentName;
				if (page.getContent()[0] !== this._detailEditMode) {
					page.removeAllContent();
					page.addContent(this._detailEditMode);
				}
				view.byId("saveButton").setVisible(true);
				view.byId("cancelButton").setVisible(true);
				view.byId("editButton").setVisible(false);
				/*view.byId("deleteButton").setVisible(false);*/
			} else {
				this._sMode = sMode;
				this._fragmentName = this._detailReadModeFragmentName;
				if (page.getContent()[0] !== this._detailReadMode) {
					page.removeAllContent();
					page.addContent(this._detailReadMode);
				}
				view.byId("saveButton").setVisible(false);
				view.byId("cancelButton").setVisible(false);
				view.byId("editButton").setVisible(true);
				/*view.byId("deleteButton").setVisible(true);*/
			}
		},

		/**
		 * detai view edit button handler
		 */
		editItem: function() {
			this.switchMode("edit");
		},

		/**
		 * Handler del SAVE, ya sea para crear o editar elementos
		 */
		saveChanges: function() {
			var model = this.getView().getModel();
			if (model.hasPendingChanges() || model.newEntryContext) { //si estoy en editar o crear..
				this.getView().setBusy(true);

				model.submitChanges(
					jQuery.proxy(function(oData, oResponse) {
						this.getView().setBusy(false);
						this.openDialog("i18n>saveSuccess");
						//this.switchMode("read");
						if (oResponse && oResponse.statusCode === 201) { // 201 == Created
							if (oData && oData.__metadata && oData.__metadata.id) {
								var idx = oData.__metadata.id.lastIndexOf("/");
								var bindingPath = oData.__metadata.id.substring(idx);
								this.getRouter().navTo("detail", {
									entity: bindingPath.substr(1)
								}, true);
							}
						}
					}, this),
					jQuery.proxy(function(error) {
						this.getView().setBusy(false);
						//this.openDialog("i18n>saveFailed");
						var msg = error;
						if (typeof(error) === "object" && error.response && error.response.body) {
							msg = error.response.body;
						}
						this._showServiceError(msg);
					}, this)
				);
			}
		},

		/**
		 * cancel edit handler
		 */
		cancelEdit: function() {
			var model = this.getView().getModel();
			if (model.hasPendingChanges() || model.newEntryContext) {
				this.openCancelConfirmDialog();
			} else {
				this.switchMode("edit");
			}
		},

		/**
		 * open deleteConfirmDialog
		 */
		openDeleteConfirmDialog: function() {
			if (!this._deleteConfirmDialog) {
				var id = this.getView().getId();
				var frgId = id + "-_deleteConfirmDialog";
				this._deleteConfirmDialog = sap.ui.xmlfragment(frgId, "com.ataway.app.view.DeleteConfirmDialog", this);
				this.getView().addDependent(this._deleteConfirmDialog);
			}
			this._deleteConfirmDialog.open();
		},

		/**
		 * confirm delete handler
		 */
		confirmDelete: function() {
			if (this._deleteConfirmDialog) {
				this._deleteConfirmDialog.close();
			}
			if (this.getView().getBindingContext()) {
				var model = this.getView().getModel();
				if (model) {
					this.getView().setBusy(true);
					model.remove(this.getView().getBindingContext().getPath(), {
						success: jQuery.proxy(function(oData, oResponse) {
							this.getView().setBusy(false);
							this.openDialog("i18n>deleteSuccess");
							if (Device.system.phone) {
								this.onNavBack();
							}
						}, this),
						error: jQuery.proxy(function(error) {
							this.getView().setBusy(false);
							//this.openDialog("i18n>deleteFailed");
							var msg = error;
							if (typeof(error) === "object" && error.response && error.response.body) {
								msg = error.response.body;
							}
							this._showServiceError(msg);
						}, this)
					});
				}
			}
		},

		/**
		 * close deleteConfirmDialog
		 */
		closeDeleteConfirmDialog: function() {
			if (this._deleteConfirmDialog) {
				this._deleteConfirmDialog.close();
			}
		},

		/**
		 * detai view delete button handler
		 */
		deleteItem: function() {
			this.openDeleteConfirmDialog();
		},

		/**
		 * Shows a {@link sap.m.MessageBox} when a service call has failed.
		 * Only the first error message will be display.
		 * @param {string} sDetails a technical error to be displayed on request
		 * @private
		 */
		_showServiceError: function(sDetails) {
			MessageBox.error(
				this._sErrorText, {
					id: "serviceErrorMessageBox",
					details: sDetails,
					styleClass: this.getOwnerComponent().getContentDensityClass(),
					actions: [MessageBox.Action.CLOSE]
				}
			);
		}
	});
});